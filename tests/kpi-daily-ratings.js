#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DATA_ROOT = path.join(os.tmpdir(), `kpi-daily-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
process.env.ATTENDANCE_DATA_DIR = TEMP_DATA_ROOT;
process.env.ATTENDANCE_AUTO_SEED = '0';

const store = require('../lib/sqlite');

function expectThrows(fn, pattern, label) {
    let thrown = null;
    try {
        fn();
    } catch (error) {
        thrown = error;
    }
    assert(thrown, `${label} should throw`);
    assert(pattern.test(String(thrown.message || thrown)), `${label} returned "${thrown.message || thrown}"`);
}

function run() {
    store.ensureSystemReady();
    const plan = store.createPlan({
        id: 'daily_kpi_test',
        name: 'Daily KPI Test',
        price_monthly: 0,
        max_branches: 2,
        max_users: 10,
        max_invoices_monthly: 0,
        ai_monthly_quota: 0,
        modules: { attendance: true, sales: false, inventory: false, invoicing: false, reports: true, ai_reader: false }
    });
    const company = store.createCompany({
        name: 'Daily KPI Company',
        companyCode: 'daily-kpi-company',
        subdomain: 'daily-kpi-company',
        planId: plan.id,
        adminUsername: 'daily_kpi_admin',
        adminName: 'Daily KPI Admin',
        adminPassword: 'Password123!'
    }).company;

    store.runWithTenantContextByCompany(company.id, () => {
        const settings = store.getKpiEvaluationSettings();
        assert.strictEqual(settings.frequency, 'daily');
        assert.strictEqual(settings.mode, 'required_all');
        assert.strictEqual(settings.active, true);
        assert.strictEqual(settings.commentRequiredForAllRequiredEvaluations, false);
        assert.strictEqual(settings.commentRequiredForIssueEncounterLowRating, false);

        const branch = store.listBranches()[0];
        const employees = ['alpha', 'bravo', 'charlie'].map((id) => store.addUser({
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            password: 'Password123!',
            role: 'employee',
            branchId: branch.id
        }));
        const workDate = new Date(2026, 6, 3, 9, 0, 0);
        employees.forEach((employee) => store.recordTimeIn(employee.id, workDate));

        const context = store.getKpiEvaluationContext(employees[0].id, workDate);
        assert.strictEqual(context.requiredEvaluation.isDue, true);
        assert.strictEqual(context.requiredEvaluation.employeeCount, 2);
        assert.deepStrictEqual(context.ratingGuide.map((item) => item.label), [
            'Very Bad', 'Bad', 'Neutral', 'Good', 'Very Good'
        ]);

        const absentEmployee = store.addUser({
            id: 'delta',
            name: 'Delta',
            password: 'Password123!',
            role: 'employee',
            branchId: branch.id
        });
        store.getMasterDb().prepare(`
            UPDATE users
            SET created_at = '2026-07-01 00:00:00'
            WHERE company_id = ?
              AND username IN ('alpha', 'bravo', 'charlie', 'delta')
        `).run(company.id);
        store.getTenantDb().prepare(`
            UPDATE kpi_evaluation_settings
            SET created_at = '2026-07-03 00:00:00'
            WHERE id = 'default'
        `).run();
        store.recordTimeIn(absentEmployee.id, new Date(2026, 6, 2, 9, 0, 0));
        store.recordTimeOut(absentEmployee.id, new Date(2026, 6, 2, 17, 0, 0));
        const contextWithAbsentPeer = store.getKpiEvaluationContext(employees[0].id, workDate);
        assert.strictEqual(contextWithAbsentPeer.requiredEvaluation.employeeCount, 2);
        assert(!contextWithAbsentPeer.activeEmployees.some((employee) => employee.id === absentEmployee.id));
        expectThrows(
            () => store.recordTimeOut(employees[0].id, new Date(2026, 6, 3, 17, 0, 0), {
                requiredEvaluations: [
                    { ratedEmployeeId: employees[1].id, rating: 1 },
                    { ratedEmployeeId: employees[2].id, rating: 3 },
                    { ratedEmployeeId: absentEmployee.id, rating: 5 }
                ]
            }),
            /only present employees can be rated/i,
            'absent employee daily KPI'
        );

        expectThrows(
            () => store.recordTimeOut(employees[0].id, new Date(2026, 6, 3, 17, 0, 0), {
                requiredEvaluations: [{ ratedEmployeeId: employees[1].id, rating: 1 }]
            }),
            /every present employee/i,
            'incomplete daily KPI'
        );

        const preTimeOutScore = store.getKpiEvaluationSummary(new Date(2026, 6, 3, 16, 0, 0))
            .dailyEmployeeScores
            .find((score) => score.employeeId === employees[0].id);
        assert(preTimeOutScore, 'present employee should have a KPI summary before time out');
        assert.strictEqual(preTimeOutScore.isKpiFinalized, false);
        assert.strictEqual(preTimeOutScore.kpiScorePercent, null, 'current KPI must remain pending before the 6:00 PM shift end');
        assert.strictEqual(preTimeOutScore.averageKpiScorePercent, null, 'pending current day must not enter the top KPI average');
        assert.strictEqual(preTimeOutScore.kpiScoreDayCount, 0);
        assert.strictEqual(preTimeOutScore.taskCompletionPercent, 0);
        assert.strictEqual(preTimeOutScore.taskQualityPercent, 0);
        assert.strictEqual(preTimeOutScore.initiativePercent, 0);
        const beforeShiftEndHistory = store.getKpiDailyScoreHistory(employees[0].id, {
            days: 7,
            at: new Date(2026, 6, 3, 17, 59, 0)
        });
        assert(!beforeShiftEndHistory.items.some((item) => item.dateKey === '2026-07-03'), 'current day must not enter history before shift end');
        const preTimeOutHistoryScore = store.getKpiDailyScoreHistory(employees[0].id, { days: 7 })
            .items
            .find((item) => item.dateKey === '2026-07-03');
        assert(preTimeOutHistoryScore, 'present employee should have a daily history row before time out');
        assert.strictEqual(preTimeOutHistoryScore.taskCompletionPercent, 0);
        assert.strictEqual(preTimeOutHistoryScore.taskQualityPercent, 0);
        assert.strictEqual(preTimeOutHistoryScore.initiativePercent, 0);

        const submissions = [
            [
                { ratedEmployeeId: employees[1].id, rating: 1 },
                { ratedEmployeeId: employees[2].id, rating: 3 }
            ],
            [
                { ratedEmployeeId: employees[0].id, rating: 2 },
                { ratedEmployeeId: employees[2].id, rating: 4 }
            ],
            [
                { ratedEmployeeId: employees[0].id, rating: 5 },
                { ratedEmployeeId: employees[1].id, rating: 4 }
            ]
        ];
        employees.forEach((employee, index) => {
            store.recordTimeOut(employee.id, new Date(2026, 6, 3, 17, index, 0), {
                requiredEvaluations: submissions[index]
            });
        });

        const summary = store.getKpiEvaluationSummary(new Date(2026, 6, 3, 18, 0, 0));
        assert.strictEqual(summary.totalEvaluations, 6);
        assert.strictEqual(summary.averageRating, 3.17);
        assert.strictEqual(summary.lowRatingCount, 2);
        assert.strictEqual(summary.excellentRatingCount, 1);
        assert.strictEqual(summary.pendingRequiredEvaluations, 0);
        assert.deepStrictEqual(
            summary.dailyEmployeeScores.map((score) => ({
                employeeId: score.employeeId,
                averageRating: score.averageRating,
                raterCount: score.raterCount,
                expectedRaterCount: score.expectedRaterCount,
                completionPercent: score.completionPercent,
                attendancePercent: score.attendancePercent,
                punctualityPercent: score.punctualityPercent,
                taskCompletionPercent: score.taskCompletionPercent,
                taskQualityPercent: score.taskQualityPercent,
                peerEvaluationPercent: score.peerEvaluationPercent,
                initiativePercent: score.initiativePercent,
                kpiScorePercent: score.kpiScorePercent
            })),
            [
                { employeeId: 'alpha', averageRating: 3.5, raterCount: 2, expectedRaterCount: 2, completionPercent: 100, attendancePercent: 100, punctualityPercent: 100, taskCompletionPercent: 0, taskQualityPercent: 0, peerEvaluationPercent: 70, initiativePercent: 0, kpiScorePercent: 41 },
                { employeeId: 'bravo', averageRating: 2.5, raterCount: 2, expectedRaterCount: 2, completionPercent: 100, attendancePercent: 100, punctualityPercent: 100, taskCompletionPercent: 0, taskQualityPercent: 0, peerEvaluationPercent: 50, initiativePercent: 0, kpiScorePercent: 38 },
                { employeeId: 'charlie', averageRating: 3.5, raterCount: 2, expectedRaterCount: 2, completionPercent: 100, attendancePercent: 100, punctualityPercent: 100, taskCompletionPercent: 0, taskQualityPercent: 0, peerEvaluationPercent: 70, initiativePercent: 0, kpiScorePercent: 41 },
                { employeeId: 'delta', averageRating: 0, raterCount: 0, expectedRaterCount: 0, completionPercent: 0, attendancePercent: 0, punctualityPercent: 0, taskCompletionPercent: 0, taskQualityPercent: 0, peerEvaluationPercent: 0, initiativePercent: 0, kpiScorePercent: 0 }
            ]
        );
        const alphaDailyAverage = summary.dailyEmployeeScores.find((score) => score.employeeId === employees[0].id);
        assert.strictEqual(alphaDailyAverage.averageKpiScorePercent, 41);
        assert.strictEqual(alphaDailyAverage.kpiScoreDayCount, 1);
        assert.deepStrictEqual(
            alphaDailyAverage.dailyKpiScores.map((score) => ({ dateKey: score.dateKey, kpiScorePercent: score.kpiScorePercent })),
            [{ dateKey: '2026-07-03', kpiScorePercent: 41 }],
            'time-out records should receive the employee daily KPI for their exact date'
        );
        const nextDaySummary = store.getKpiEvaluationSummary(new Date(2026, 6, 4, 18, 0, 0));
        const alphaNextDayAverage = nextDaySummary.dailyEmployeeScores.find((score) => score.employeeId === employees[0].id);
        assert.strictEqual(alphaNextDayAverage.kpiScorePercent, 0, 'the current daily score should remain separate');
        assert.strictEqual(alphaNextDayAverage.averageKpiScorePercent, 20.5, 'top KPI should average the 41% and 0% daily scores');
        assert.strictEqual(alphaNextDayAverage.kpiScoreDayCount, 2);
        const sundaySummary = store.getKpiEvaluationSummary(new Date(2026, 6, 5, 20, 0, 0));
        const alphaSundayScore = sundaySummary.dailyEmployeeScores.find((score) => score.employeeId === employees[0].id);
        assert.strictEqual(alphaSundayScore.isKpiWorkingDay, false);
        assert.strictEqual(alphaSundayScore.isKpiFinalized, false, 'Sunday day off must never be finalized as a KPI day');
        assert.strictEqual(alphaSundayScore.kpiScorePercent, null);
        assert.strictEqual(alphaSundayScore.averageKpiScorePercent, 20.5, 'Sunday must not change the daily KPI average');
        assert.strictEqual(alphaSundayScore.kpiScoreDayCount, 2, 'Sunday must not enter the average divisor');
        const sundayHistory = store.getKpiDailyScoreHistory(employees[0].id, {
            days: 7,
            at: new Date(2026, 6, 5, 20, 0, 0)
        });
        const sundayDayOff = sundayHistory.items.find((item) => item.dateKey === '2026-07-05');
        assert(sundayDayOff, 'July 5 Sunday day off must appear after the July 1 history start');
        assert.strictEqual(sundayDayOff.recordType, 'day_off');
        assert.strictEqual(sundayDayOff.statusLabel, 'Day Off');
        assert.strictEqual(sundayDayOff.isKpiFinalized, false);
        assert.strictEqual(sundayDayOff.kpiScorePercent, null);
        assert.strictEqual(sundayHistory.dayOffHistoryStartDate, '2026-07-01');

        const absentHistory = store.getKpiDailyScoreHistory(absentEmployee.id, { days: 7 });
        assert.strictEqual(absentHistory.startDate, '2026-07-01');
        assert.strictEqual(absentHistory.kpiActivatedDate, '2026-07-03');
        assert(!absentHistory.items.some((item) => item.dateKey === '2026-07-02'), 'pre-KPI attendance must not appear in score history');
        const absentDailyScore = absentHistory.items.find((item) => item.dateKey === '2026-07-03');
        assert(absentDailyScore, 'active absent employee should have a daily KPI history row');
        assert.strictEqual(absentDailyScore.isPresent, false);
        assert.strictEqual(absentDailyScore.completionPercent, 0);
        assert.strictEqual(absentDailyScore.taskCompletionPercent, 0);
        assert.strictEqual(absentDailyScore.taskQualityPercent, 0);
        assert.strictEqual(absentDailyScore.initiativePercent, 0);
        assert.strictEqual(absentDailyScore.kpiScorePercent, 0);

        store.getMasterDb().prepare(`
            UPDATE users
            SET time_in = '09:00',
                time_out = '17:00',
                schedule_json = '{}'
            WHERE company_id = ?
              AND username = ?
        `).run(company.id, absentEmployee.id);
        store.recordTimeIn(absentEmployee.id, new Date(2026, 6, 4, 9, 30, 0));
        const lateEmployeeScore = store.getKpiEvaluationSummary(new Date(2026, 6, 4, 17, 0, 0))
            .dailyEmployeeScores
            .find((score) => score.employeeId === absentEmployee.id);
        assert(lateEmployeeScore, 'late employee should have a KPI score');
        assert.strictEqual(lateEmployeeScore.workingDays, 1);
        assert.strictEqual(lateEmployeeScore.presentDays, 1);
        assert.strictEqual(lateEmployeeScore.onTimeDays, 0);
        assert.strictEqual(
            lateEmployeeScore.punctualityPercent,
            93.75,
            '30 late minutes on an 8-hour shift should reduce punctuality from 100% to 93.75%'
        );

        const records = store.listKpiEvaluations({ frequency: 'daily' });
        assert.strictEqual(records.length, 6);
        assert(records.every((record) => record.comment === ''), 'comments should remain optional');
        assert(
            !store.listActiveKpiEmployees().some((employee) => employee.id === 'daily_kpi_admin'),
            'company admins must never appear in the rateable KPI employee roster'
        );
        const alphaPeerRecord = records.find((record) => record.ratedEmployeeId === employees[0].id);
        assert(alphaPeerRecord, 'an employee peer record should be available for Admin review');
        const alphaBeforeAdminRating = store.getKpiEvaluationSummary(new Date(2026, 6, 3, 18, 0, 0))
            .dailyEmployeeScores
            .find((score) => score.employeeId === employees[0].id);
        assert.strictEqual(alphaBeforeAdminRating.adminRatingCount, 0, 'an unsubmitted Admin draft must not affect calculation');
        expectThrows(
            () => store.submitKpiAdminEvaluation(employees[1].id, {
                ratedEmployeeId: employees[0].id,
                dateKey: '2026-07-03',
                rating: 5,
                comment: 'Unauthorized employee Admin rating'
            }),
            /only a company admin/i,
            'employee Admin Evaluation submission'
        );
        expectThrows(
            () => store.submitKpiAdminEvaluation('daily_kpi_admin', {
                ratedEmployeeId: absentEmployee.id,
                dateKey: '2026-07-04',
                rating: 4
            }),
            /complete Time Out/i,
            'Admin Evaluation before employee Time Out'
        );
        const reviewedPeerRecord = store.reviewKpiEvaluation(alphaPeerRecord.id, {
            status: 'reviewed',
            note: 'Peer record checked.',
            actorUserId: 'daily_kpi_admin'
        });
        assert.strictEqual(reviewedPeerRecord.status, 'reviewed');
        const adminEvaluation = store.submitKpiAdminEvaluation('daily_kpi_admin', {
            ratedEmployeeId: employees[0].id,
            dateKey: '2026-07-03',
            rating: 5,
            comment: 'Strong performance and teamwork.'
        }, new Date(2026, 6, 6, 10, 5, 0));
        assert.strictEqual(adminEvaluation.evaluationType, 'admin_evaluation');
        assert.strictEqual(adminEvaluation.evaluatorEmployeeId, 'daily_kpi_admin');
        assert.strictEqual(adminEvaluation.ratedEmployeeId, employees[0].id);
        assert.strictEqual(adminEvaluation.rating, 5);
        assert.strictEqual(adminEvaluation.comment, 'Strong performance and teamwork.');
        assert.strictEqual(adminEvaluation.visibleToAdminOnly, true);
        assert.strictEqual(adminEvaluation.evaluationPeriodStart, '2026-07-03', 'a late Admin rating must stay attached to the past Time Out date');
        assert(adminEvaluation.submittedAt.startsWith('2026-07-06'), 'a late Admin rating must retain its actual submission date');
        expectThrows(
            () => store.submitKpiAdminEvaluation('daily_kpi_admin', {
                ratedEmployeeId: employees[0].id,
                dateKey: '2026-07-03',
                rating: 1
            }),
            /already submitted/i,
            'duplicate Head Admin Evaluation for the same employee and date'
        );
        const adminEvaluationRecords = store.listKpiEvaluations({ evaluationType: 'admin_evaluation' });
        assert.strictEqual(adminEvaluationRecords.length, 1);

        const alphaAfterAdminRating = store.getKpiEvaluationSummary(new Date(2026, 6, 3, 18, 0, 0))
            .dailyEmployeeScores
            .find((score) => score.employeeId === employees[0].id);
        assert.strictEqual(alphaAfterAdminRating.raterCount, 2, 'Admin must not replace or inflate coworker completion');
        assert.strictEqual(alphaAfterAdminRating.adminRatingCount, 1);
        assert.strictEqual(alphaAfterAdminRating.averageRating, 4, 'two coworker ratings plus one Admin rating should average to 4');
        assert.strictEqual(alphaAfterAdminRating.peerEvaluationPercent, 80, 'submitted Admin rating should join Peer Evaluation');
        assert.strictEqual(alphaAfterAdminRating.kpiScorePercent, 42, 'submitted Admin rating should move the weighted KPI score');
        const alphaAdminHistoryScore = store.getKpiDailyScoreHistory(employees[0].id, { days: 7 })
            .items
            .find((item) => item.dateKey === '2026-07-03');
        assert.strictEqual(alphaAdminHistoryScore.adminRatingCount, 1);
        assert.strictEqual(alphaAdminHistoryScore.peerEvaluationPercent, 80);
        assert.strictEqual(alphaAdminHistoryScore.kpiScorePercent, 42);

        const superAdminEvaluation = store.submitKpiAdminEvaluation('super_kpi_admin', {
            ratedEmployeeId: employees[1].id,
            dateKey: '2026-07-03',
            rating: 4,
            comment: 'Past Time Out reviewed by Super Admin.'
        }, new Date(2026, 6, 7, 9, 0, 0), {
            allowExternalAdmin: true,
            actorName: 'Super KPI Admin'
        });
        assert.strictEqual(superAdminEvaluation.evaluationType, 'admin_evaluation');
        assert.strictEqual(superAdminEvaluation.evaluatorEmployeeId, 'super_kpi_admin');
        assert.strictEqual(superAdminEvaluation.evaluatorName, 'Super KPI Admin');
        assert.strictEqual(superAdminEvaluation.evaluationPeriodStart, '2026-07-03');
        assert(superAdminEvaluation.submittedAt.startsWith('2026-07-07'));
        assert.strictEqual(superAdminEvaluation.visibleToAdminOnly, true);
        expectThrows(
            () => store.submitKpiAdminEvaluation('daily_kpi_admin', {
                ratedEmployeeId: employees[1].id,
                dateKey: '2026-07-03',
                rating: 5
            }),
            /already submitted/i,
            'Head Admin and Super Admin must share one fixed evaluation per employee and date'
        );

        store.getTenantDb().prepare(`
            INSERT INTO kpi_evaluation_records (
                id, submission_id, evaluator_employee_id, evaluator_name,
                rated_employee_id, rated_employee_name, rated_employee_role,
                rating, rating_label, comment, evaluation_type, evaluation_frequency,
                evaluation_period_start, evaluation_period_end, submitted_at
            ) VALUES (
                'timezone_boundary_record', 'timezone_boundary_submission', 'timezone_rater', 'Timezone Rater',
                'alpha', 'Alpha', 'employee', 5, 'Very Good', '', 'required_evaluation', 'daily',
                '2026-07-04', '2026-07-04', '2026-07-03T16:30:00.000Z'
            )
        `).run();
        assert(
            store.listKpiEvaluations({ dateFrom: '2026-07-04', dateTo: '2026-07-04' })
                .some((record) => record.id === 'timezone_boundary_record'),
            'local July 4 evaluation must appear under July 4 even when its UTC timestamp starts with July 3'
        );
        assert(
            !store.listKpiEvaluations({ dateFrom: '2026-07-03', dateTo: '2026-07-03' })
                .some((record) => record.id === 'timezone_boundary_record'),
            'local July 4 evaluation must not leak into the July 3 filter'
        );
        store.getTenantDb().prepare('DELETE FROM kpi_evaluation_records WHERE id = ?').run('timezone_boundary_record');

        const insertPeerRating = store.getTenantDb().prepare(`
            INSERT INTO kpi_evaluation_records (
                id, submission_id, evaluator_employee_id, evaluator_name,
                rated_employee_id, rated_employee_name, rated_employee_role,
                rating, rating_label, comment, evaluation_type, evaluation_frequency,
                evaluation_period_start, evaluation_period_end, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'employee', ?, ?, '', 'required_evaluation', 'daily', '2026-07-03', '2026-07-03', ?)
        `);
        [5, 5, 5, 4, 4].forEach((rating, index) => {
            insertPeerRating.run(
                `peer_formula_${index + 1}`,
                `peer_formula_submission_${index + 1}`,
                `formula_rater_${index + 1}`,
                `Formula Rater ${index + 1}`,
                absentEmployee.id,
                absentEmployee.name,
                rating,
                rating === 5 ? 'Very Good' : 'Good',
                `2026-07-03T17:3${index}:00.000Z`
            );
        });
        const peerFormulaScore = store.getKpiEvaluationSummary(new Date(2026, 6, 3, 18, 0, 0))
            .dailyEmployeeScores
            .find((score) => score.employeeId === absentEmployee.id);
        assert(peerFormulaScore, 'peer formula employee should have a KPI score');
        assert.strictEqual(peerFormulaScore.averageRating, 4.6, '23 total stars divided by 5 raters should average 4.6');
        assert.strictEqual(peerFormulaScore.peerEvaluationPercent, 92, '4.6 out of 5 stars should equal 92% of the peer category');
        assert.strictEqual((peerFormulaScore.peerEvaluationPercent * 15) / 100, 13.8, '4.6 average stars should contribute 13.8% to the total KPI');
        const peerFormulaHistoryScore = store.getKpiDailyScoreHistory(absentEmployee.id, { days: 7 })
            .items
            .find((item) => item.dateKey === '2026-07-03');
        assert.strictEqual(peerFormulaHistoryScore.averageRating, 4.6);
        assert.strictEqual(peerFormulaHistoryScore.peerEvaluationPercent, 92);

        store.getTenantDb().prepare(`
            UPDATE kpi_evaluation_settings
            SET created_at = '2026-07-06 00:00:00'
            WHERE id = 'default'
        `).run();
        const implementationBoundaryHistory = store.getKpiDailyScoreHistory(employees[0].id, {
            days: 7,
            at: new Date(2026, 6, 6, 12, 0, 0)
        });
        assert(
            implementationBoundaryHistory.items.some((item) => item.dateKey === '2026-07-05' && item.isDayOff),
            'July 5 must appear because Day Off history starts on July 1'
        );
        assert(
            !implementationBoundaryHistory.items.some((item) => item.dateKey === '2026-07-03'),
            'working dates before KPI activation must not receive calculation records'
        );

        store.updateEmployeeSchedule(employees[0].id, 'weekly_schedule', {
            monday: { is_day_off: true }
        });
        const checklistDayOffHistory = store.getKpiDailyScoreHistory(employees[0].id, {
            days: 7,
            at: new Date(2026, 6, 6, 12, 0, 0)
        });
        const mondayDayOff = checklistDayOffHistory.items.find((item) => item.dateKey === '2026-07-06');
        assert(mondayDayOff, 'a checked employee schedule day off must appear in KPI history');
        assert.strictEqual(mondayDayOff.statusLabel, 'Day Off');
        assert.strictEqual(mondayDayOff.kpiScorePercent, null);
        assert.strictEqual(checklistDayOffHistory.dayOffHistoryStartDate, '2026-07-01');
        assert.strictEqual(
            checklistDayOffHistory.items.filter((item) => !item.isDayOff).length,
            0,
            'schedule day off rows must not replace or create calculated KPI records'
        );
    });

    console.log('Daily KPI rating tests passed.');
}

try {
    run();
} finally {
    store.closeAll?.();
    fs.rmSync(TEMP_DATA_ROOT, { recursive: true, force: true });
}
