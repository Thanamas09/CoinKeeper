import 'fake-indexeddb/auto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import demo from '../demo/chula-student-november-2026.json';
import {BudgetReport, budgetReport} from './budget-report';
import {cents, initial, mergeData, readData, removeAccount, validate, writeData} from './data';

describe('Budget vs Actual', () => {
  const month = '2026-11';
  const data = mergeData(initial, validate(demo));
  const allocations = demo.accountBudgets;

  it('เก็บงบรายบัญชีในฐานข้อมูลและไฟล์สำรอง พร้อมรักษางบรวม', async () => {
    const withoutAllocations = validate({...data, accountBudgets: undefined});
    await writeData(withoutAllocations);
    await writeData(data, withoutAllocations);
    const stored = await readData();
    expect(stored.budgets).toEqual(data.budgets);
    expect(validate(JSON.parse(JSON.stringify(stored))).accountBudgets).toEqual(allocations);
    expect(mergeData(initial, stored).accountBudgets).toEqual(allocations);
    expect(mergeData(withoutAllocations, stored).accountBudgets).toBeUndefined();
    expect(validate(removeAccount(stored, 'demo-student-study-account')).accountBudgets)
      .toEqual({[month]: {'demo-student-main': 800_000}});
    expect(() => validate({...stored, budgets: {[month]: 949_999}})).toThrow('สูงกว่างบรวม');
  });

  it('เปิดรายงานที่เดือนตัวอย่างแม้เดือนปัจจุบันจะเปลี่ยนไป', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2027, 0, 1));
      const html = renderToStaticMarkup(createElement(BudgetReport, {data, initialMonth: month}));
      expect(html).toContain('value="2026-11"');
      expect(html).toContain('เกินงบ 1,500 บาท (+15.0%)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('รายงานเดโมรวมเฉพาะรายจ่ายและยอดตรงกับรายการต้นทาง', () => {
    const report = budgetReport(data, month);
    expect(report).toMatchObject({budget: 1_000_000, actual: 1_150_000, difference: 150_000, percent: 15});
    expect(report.entries.map(entry => entry.id)).toEqual(['demo-student-meals-second', 'demo-student-materials', 'demo-student-travel', 'demo-student-meals-first', 'demo-student-rent']);
    expect(report.entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(report.actual);
  });

  it('แสดงเดือนปัจจุบันตามเวลาท้องถิ่นและข้อความสรุปของเดโม', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 10, 1, 0, 5));
      const html = renderToStaticMarkup(createElement(BudgetReport, {
        data: {...data, accountBudgets: allocations}, save: async () => true,
      }));
      expect(html).toContain('value="2026-11"');
      expect(html).toContain('เกินงบ 1,500 บาท (+15.0%)');
      expect(html).toContain('ยอดจ่ายจริง ฿11,500.00');
      expect(html).toContain('ดูรายการที่รวมในยอดจริง');
      expect(html).toContain('แบ่งงบให้บัญชี');
      expect(html).toContain('เกิน ฿2,400.00');
      expect(html).toContain('เหลือ ฿400.00');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [1_250_000, -100_000, -8],
    [1_150_000, 0, 0],
    [0, 1_150_000, undefined],
  ])('คำนวณผลต่างเมื่องบเป็น %i สตางค์', (budget, difference, percent) => {
    const input = validate({...data, budgets: {[month]: budget}, accountBudgets: undefined});
    expect(budgetReport(input, month)).toMatchObject({budget, difference, percent});
  });

  it('ยังแสดงยอดจ่ายจริงเมื่อไม่มีงบ และแยกงบศูนย์ที่บันทึกไว้', () => {
    expect(budgetReport({...data, budgets: {}}, month)).toMatchObject({
      actual: 1_150_000, budget: undefined, difference: undefined, percent: undefined,
    });
    expect(cents('0', true)).toBe(0);
    expect(budgetReport({...data, budgets: {'2026-12': 0}}, '2026-12')).toEqual({
      actual: 0, budget: 0, difference: 0, percent: undefined, entries: [],
    });
  });

  it('เปลี่ยนเดือนแล้วใช้เฉพาะงบและรายการในเดือนที่เลือก', () => {
    const entry = {...data.entries[1], id: 'next-month', date: '2026-12-01', amount: 100};
    const input = {...data, entries: [...data.entries, entry], budgets: {...data.budgets, '2027-01': 5000}};
    expect(budgetReport(input, month).actual).toBe(1_150_000);
    expect(budgetReport(input, '2026-12')).toMatchObject({actual: 100, budget: undefined, entries: [entry]});
    expect(budgetReport(input, '2027-01')).toEqual({actual: 0, budget: 5000, difference: -5000, percent: -100, entries: []});
  });
});
