#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DATA_ROOT = path.join(os.tmpdir(), `attendance-payroll-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
process.env.ATTENDANCE_DATA_DIR = TEMP_DATA_ROOT;

const store = require('../lib/sqlite');

const GMS_OPTIONS = {
    company: {
        company_code: 'gms'
    },
    dateKey: '2026-05-08'
};
const GMS_PRE_GRACE_OPTIONS = {
    company: {
        company_code: 'gms'
    },
    dateKey: '2026-05-07'
};
const SCHEDULED_TIME_IN = '09:00';
const SCHEDULED_TIME_OUT = '18:00';

function assertPayrollCase({
    label,
    timeIn,
    timeOut,
    dailyRate,
    options = GMS_OPTIONS,
    expected
}) {
    const snapshot = store.calculateAttendancePayrollSnapshot({
        timeIn,
        timeOut,
        scheduledTimeIn: SCHEDULED_TIME_IN,
        scheduledTimeOut: SCHEDULED_TIME_OUT,
        dailyRate,
        options
    });

    assert.strictEqual(snapshot.totalSpanMinutes, expected.totalSpanMinutes, `${label}: total span minutes`);
    assert.strictEqual(snapshot.lunchBreakMinutes, expected.lunchBreakMinutes, `${label}: lunch break minutes`);
    assert.strictEqual(snapshot.workedMinutes, expected.workedMinutes, `${label}: worked minutes`);
    assert.strictEqual(snapshot.shortMinutes, expected.shortMinutes, `${label}: short minutes`);
    assert.strictEqual(
        store.calculateLateMinutes(timeIn, SCHEDULED_TIME_IN, options),
        expected.lateMinutes,
        `${label}: late minutes`
    );
    assert.strictEqual(snapshot.lateDeductionMinutes, expected.lateDeductionMinutes, `${label}: late deduction minutes`);
    assert.strictEqual(snapshot.earlyOutDeductionMinutes, expected.earlyOutDeductionMinutes, `${label}: early out deduction minutes`);
    assert.strictEqual(snapshot.totalDeductionMinutes, expected.totalDeductionMinutes, `${label}: total deduction minutes`);
    assert.strictEqual(snapshot.hourlyRate, expected.hourlyRate, `${label}: hourly rate`);
    assert.strictEqual(snapshot.deductionAmount, expected.deductionAmount, `${label}: deduction amount`);
    assert.strictEqual(snapshot.finalPay, expected.finalPay, `${label}: final pay`);

    const workedHours = store.calculateWorkedHours(timeIn, timeOut, SCHEDULED_TIME_IN, SCHEDULED_TIME_OUT, options);
    assert.strictEqual(workedHours, expected.workedHours, `${label}: worked hours string`);
}

function run() {
    assertPayrollCase({
        label: '9:08 AM to 6:08 PM without grace period',
        timeIn: '09:08',
        timeOut: '18:08',
        dailyRate: 625,
        expected: {
            totalSpanMinutes: 540,
            lunchBreakMinutes: 60,
            workedMinutes: 480,
            shortMinutes: 0,
            lateMinutes: 8,
            lateDeductionMinutes: 8,
            earlyOutDeductionMinutes: 0,
            totalDeductionMinutes: 8,
            hourlyRate: 78.13,
            deductionAmount: 10.42,
            finalPay: 614.58,
            workedHours: '8.00'
        }
    });

    assertPayrollCase({
        label: '9:08 AM to 6:08 PM on earlier date without grace period',
        timeIn: '09:08',
        timeOut: '18:08',
        dailyRate: 625,
        options: GMS_PRE_GRACE_OPTIONS,
        expected: {
            totalSpanMinutes: 540,
            lunchBreakMinutes: 60,
            workedMinutes: 480,
            shortMinutes: 0,
            lateMinutes: 8,
            lateDeductionMinutes: 8,
            earlyOutDeductionMinutes: 0,
            totalDeductionMinutes: 8,
            hourlyRate: 78.13,
            deductionAmount: 10.42,
            finalPay: 614.58,
            workedHours: '8.00'
        }
    });

    assertPayrollCase({
        label: '9:08 AM to 6:00 PM without grace period',
        timeIn: '09:08',
        timeOut: '18:00',
        dailyRate: 625,
        expected: {
            totalSpanMinutes: 532,
            lunchBreakMinutes: 60,
            workedMinutes: 472,
            shortMinutes: 8,
            lateMinutes: 8,
            lateDeductionMinutes: 8,
            earlyOutDeductionMinutes: 0,
            totalDeductionMinutes: 8,
            hourlyRate: 78.13,
            deductionAmount: 10.42,
            finalPay: 614.58,
            workedHours: '7.87'
        }
    });

    assertPayrollCase({
        label: '9:00 AM to 5:52 PM',
        timeIn: '09:00',
        timeOut: '17:52',
        dailyRate: 625,
        expected: {
            totalSpanMinutes: 532,
            lunchBreakMinutes: 60,
            workedMinutes: 472,
            shortMinutes: 8,
            lateMinutes: 0,
            lateDeductionMinutes: 0,
            earlyOutDeductionMinutes: 8,
            totalDeductionMinutes: 8,
            hourlyRate: 78.13,
            deductionAmount: 10.42,
            finalPay: 614.58,
            workedHours: '7.87'
        }
    });

    assertPayrollCase({
        label: '9:08 AM to 5:52 PM without grace period',
        timeIn: '09:08',
        timeOut: '17:52',
        dailyRate: 625,
        expected: {
            totalSpanMinutes: 524,
            lunchBreakMinutes: 60,
            workedMinutes: 464,
            shortMinutes: 16,
            lateMinutes: 8,
            lateDeductionMinutes: 8,
            earlyOutDeductionMinutes: 8,
            totalDeductionMinutes: 16,
            hourlyRate: 78.13,
            deductionAmount: 20.83,
            finalPay: 604.17,
            workedHours: '7.73'
        }
    });

    assertPayrollCase({
        label: '10:15 AM to 7:04 PM',
        timeIn: '10:15',
        timeOut: '19:04',
        dailyRate: 625,
        expected: {
            totalSpanMinutes: 529,
            lunchBreakMinutes: 60,
            workedMinutes: 469,
            shortMinutes: 11,
            lateMinutes: 75,
            lateDeductionMinutes: 75,
            earlyOutDeductionMinutes: 0,
            totalDeductionMinutes: 75,
            hourlyRate: 78.13,
            deductionAmount: 97.66,
            finalPay: 527.34,
            workedHours: '7.82'
        }
    });

    assertPayrollCase({
        label: '1:15 PM to 6:00 PM',
        timeIn: '13:15',
        timeOut: '18:00',
        dailyRate: 625,
        expected: {
            totalSpanMinutes: 285,
            lunchBreakMinutes: 0,
            workedMinutes: 285,
            shortMinutes: 195,
            lateMinutes: 255,
            lateDeductionMinutes: 195,
            earlyOutDeductionMinutes: 0,
            totalDeductionMinutes: 195,
            hourlyRate: 78.13,
            deductionAmount: 253.91,
            finalPay: 371.09,
            workedHours: '4.75'
        }
    });

    console.log('payroll computation tests passed');
}

try {
    run();
} finally {
    try {
        store.closeAll();
    } catch (_error) {
        // Ignore cleanup issues in the focused payroll test.
    }
    fs.rmSync(TEMP_DATA_ROOT, { recursive: true, force: true });
}
