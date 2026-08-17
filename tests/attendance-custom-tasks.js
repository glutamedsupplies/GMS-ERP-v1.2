#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DATA_ROOT = path.join(os.tmpdir(), `attendance-custom-tasks-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
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
        id: 'custom_task_test',
        name: 'Custom Task Test',
        price_monthly: 0,
        max_branches: 2,
        max_users: 10,
        max_invoices_monthly: 0,
        ai_monthly_quota: 0,
        modules: {
            attendance: true,
            sales: false,
            inventory: false,
            invoicing: false,
            reports: true,
            ai_reader: false
        }
    });
    const company = store.createCompany({
        name: 'Custom Task Company',
        companyCode: 'custom-task-company',
        subdomain: 'custom-task-company',
        planId: plan.id,
        adminUsername: 'custom_task_admin',
        adminName: 'Custom Task Admin',
        adminPassword: 'Password123!'
    }).company;

    store.runWithTenantContextByCompany(company.id, () => {
        const branch = store.listBranches()[0];
        const numericTask = store.addTask({ name: 'Pack orders', inputType: 'numeric' });
        const checklistTask = store.addTask({ name: 'Lock storage', inputType: 'checklist' });
        const textTask = store.addTask({ name: 'Shift summary', inputType: 'text' });
        assert.deepStrictEqual(
            store.listTasks().map((task) => ({ name: task.name, inputType: task.inputType })),
            [
                { name: 'Lock storage', inputType: 'checklist' },
                { name: 'Pack orders', inputType: 'numeric' },
                { name: 'Shift summary', inputType: 'text' }
            ]
        );
        const assignedEmployee = store.addUser({
            id: 'assigned_employee',
            name: 'Assigned Employee',
            password: 'Password123!',
            role: 'employee',
            branchId: branch.id
        });
        const assignedUser = store.setUserAssignedTask(assignedEmployee.id, {
            taskIds: [numericTask.id, checklistTask.id, textTask.id],
            customTasks: [
                { name: 'Verify packing quality', inputType: 'checklist' },
                { name: 'Document damaged stock', inputType: 'text' },
                { name: 'Count priority orders', inputType: 'numeric' }
            ]
        });
        assert.deepStrictEqual(
            assignedUser.assigned_tasks.filter((task) => !task.isCustom).map((task) => task.inputType),
            ['numeric', 'checklist', 'text']
        );
        const specificTasks = assignedUser.assigned_tasks.filter((task) => task.isCustom);
        assert.strictEqual(specificTasks.length, 3);

        store.recordTimeIn(assignedEmployee.id, new Date(2026, 6, 3, 9, 0, 0));
        expectThrows(
            () => store.recordTimeOut(assignedEmployee.id, new Date(2026, 6, 3, 17, 0, 0), {
                taskResults: [{ taskId: '999999', taskCount: 1 }]
            }),
            /not assigned/i,
            'unassigned task id'
        );

        const assignedResult = store.recordTimeOut(assignedEmployee.id, new Date(2026, 6, 3, 17, 0, 0), {
            taskResults: [
                { taskId: numericTask.id, taskValue: 4 },
                { taskId: checklistTask.id, taskValue: true },
                { taskId: textTask.id, taskValue: 'Completed without blockers' },
                { taskId: specificTasks[0].id, taskValue: true },
                { taskName: 'Inventory recount', inputType: 'text', taskValue: 'Aisle B verified', isCustom: true }
            ]
        });
        assert.deepStrictEqual(assignedResult.record.taskResults, [
            { id: numericTask.id, name: 'Pack orders', inputType: 'numeric', value: 4, count: 4 },
            { id: checklistTask.id, name: 'Lock storage', inputType: 'checklist', value: true, count: 1 },
            { id: textTask.id, name: 'Shift summary', inputType: 'text', value: 'Completed without blockers', count: 0 },
            { id: specificTasks[0].id, name: 'Verify packing quality', inputType: 'checklist', value: true, count: 1, isCustom: true },
            { id: '', name: 'Inventory recount', inputType: 'text', value: 'Aisle B verified', count: 0, isCustom: true }
        ]);
        const assignedKpiScore = store.getKpiEvaluationSummary(new Date(2026, 6, 3, 18, 0, 0))
            .dailyEmployeeScores
            .find((score) => score.employeeId === assignedEmployee.id);
        assert(assignedKpiScore, 'assigned employee should have a KPI score');
        assert.strictEqual(assignedKpiScore.taskCompletionPercent, 100, 'three completed main tasks should earn the full 20% category');
        assert.strictEqual(assignedKpiScore.taskQualityPercent, 33.33, 'one of three completed specific tasks should earn one third of the 25% category');
        assert.strictEqual(assignedKpiScore.initiativePercent, 100, 'one completed initiative should earn the full 10% category');

        const selfTaskEmployee = store.addUser({
            id: 'self_task_employee',
            name: 'Self Task Employee',
            password: 'Password123!',
            role: 'employee',
            branchId: branch.id
        });
        const presentPeer = store.addUser({
            id: 'present_peer',
            name: 'Present Peer',
            password: 'Password123!',
            role: 'employee',
            branchId: branch.id
        });
        store.recordTimeIn(selfTaskEmployee.id, new Date(2026, 6, 4, 9, 0, 0));
        store.recordTimeIn(presentPeer.id, new Date(2026, 6, 4, 9, 5, 0));
        const assignedCustomUser = store.setUserAssignedTask(selfTaskEmployee.id, {
            customTasks: [{ name: 'Clean work area', inputType: 'checklist' }]
        });
        const employeeTask = assignedCustomUser.assigned_tasks.find((task) => task.isCustom);
        assert(employeeTask, 'employee-specific task should be assigned without creating a task-management record');
        assert(!store.listTasks().some((task) => task.name === 'Clean work area'), 'employee-specific task should not be added to task management');
        const selfTaskResult = store.recordTimeOut(selfTaskEmployee.id, new Date(2026, 6, 4, 17, 0, 0), {
            taskResults: [
                { taskId: employeeTask.id, taskValue: true }
            ],
            requiredEvaluations: [
                { ratedEmployeeId: presentPeer.id, rating: 1 }
            ]
        });
        assert.deepStrictEqual(selfTaskResult.record.taskResults, [
            { id: employeeTask.id, name: 'Clean work area', inputType: 'checklist', value: true, count: 1, isCustom: true }
        ]);
        const specificOnlyKpiScore = store.getKpiEvaluationSummary(new Date(2026, 6, 4, 18, 0, 0))
            .dailyEmployeeScores
            .find((score) => score.employeeId === selfTaskEmployee.id);
        assert(specificOnlyKpiScore, 'specific-task employee should have a KPI score');
        assert.strictEqual(specificOnlyKpiScore.taskCompletionPercent, 0, 'specific tasks must not count as main task completion');
        assert.strictEqual(specificOnlyKpiScore.taskQualityPercent, 100, 'completed specific tasks should drive task quality');
        assert.strictEqual(specificOnlyKpiScore.initiativePercent, 0, 'admin-assigned specific tasks must not count as initiative');

        const mainOnlyEmployee = store.addUser({
            id: 'main_only_employee',
            name: 'Main Only Employee',
            password: 'Password123!',
            role: 'employee',
            branchId: branch.id
        });
        store.setUserAssignedTask(mainOnlyEmployee.id, {
            taskIds: [numericTask.id, checklistTask.id]
        });
        store.recordTimeIn(mainOnlyEmployee.id, new Date(2026, 6, 6, 9, 0, 0));
        store.recordTimeOut(mainOnlyEmployee.id, new Date(2026, 6, 6, 17, 0, 0), {
            taskResults: [{ taskId: numericTask.id, taskValue: 2 }]
        });
        const mainOnlyKpiScore = store.getKpiEvaluationSummary(new Date(2026, 6, 6, 18, 0, 0))
            .dailyEmployeeScores
            .find((score) => score.employeeId === mainOnlyEmployee.id);
        assert(mainOnlyKpiScore, 'main-task-only employee should have a KPI score');
        assert.strictEqual(mainOnlyKpiScore.taskCompletionPercent, 50, 'one of two main tasks should earn half of the 20% category');
        assert.strictEqual(mainOnlyKpiScore.taskQualityPercent, 50, 'task quality should fall back to main tasks when no specific task exists');
        assert.strictEqual(mainOnlyKpiScore.initiativePercent, 0);
    });

    console.log('Attendance custom task tests passed.');
}

try {
    run();
} finally {
    store.closeAll?.();
    fs.rmSync(TEMP_DATA_ROOT, { recursive: true, force: true });
}
