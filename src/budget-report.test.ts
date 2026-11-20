import 'fake-indexeddb/auto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import demo from '../demo/online-shop-november-2026.json';
import {BudgetReport, budgetReport} from './budget-report';
import {cents, initial, mergeData, readData, removeAccount, validate, writeData} from './data';

describe('Budget vs. Actual', () => {
  const month = '2026-11';
  const data = mergeData(initial, validate(demo));
  const allocations = {[month]: {'demo-shop-main': 8_000_000, 'demo-shop-reserve': 1_000_000}};

  it('เก็บงบรายบัญชีในฐานข้อมูลและไฟล์สำรอง พร้อมรักษางบรวม', async () => {
    await writeData(data);
    await writeData({...data, accountBudgets: allocations}, data);
    const stored = await readData();
    expect(stored.budgets).toEqual(data.budgets);
    expect(validate(JSON.parse(JSON.stringify(stored))).accountBudgets).toEqual(allocations);
    expect(mergeData(initial, stored).accountBudgets).toEqual(allocations);
    expect(mergeData(data, stored).accountBudgets).toBeUndefined();
    expect(validate(removeAccount(stored, 'demo-shop-reserve')).accountBudgets)
      .toEqual({[month]: {'demo-shop-main': 8_000_000}});
    expect(() => validate({...stored, budgets: {[month]: 8_999_999}})).toThrow('สูงกว่างบรวม');
  });

  it('รายงานเดโมรวมเฉพาะรายจ่ายและยอดตรงกับรายการต้นทาง', () => {
    const report = budgetReport(data, month);
    expect(report).toMatchObject({budget: 10_000_000, actual: 11_500_000, difference: 1_500_000, percent: 15});
    expect(report.entries.map(entry => entry.id)).toEqual(['demo-shop-ads', 'demo-shop-courier', 'demo-shop-supplier']);
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
      expect(html).toContain('เกินงบ 15,000 บาท (+15.0%)');
      expect(html).toContain('ยอดจ่ายจริง ฿115,000.00');
      expect(html).toContain('ดูรายการที่รวมในยอดจริง');
      expect(html).toContain('แบ่งงบให้บัญชี');
      expect(html).toContain('เกิน ฿35,000.00');
      expect(html).toContain('เหลือ ฿10,000.00');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [12_500_000, -1_000_000, -8],
    [11_500_000, 0, 0],
    [0, 11_500_000, undefined],
  ])('คำนวณผลต่างเมื่องบเป็น %i สตางค์', (budget, difference, percent) => {
    const input = validate({...data, budgets: {[month]: budget}});
    expect(budgetReport(input, month)).toMatchObject({budget, difference, percent});
  });

  it('ยังแสดงยอดจ่ายจริงเมื่อไม่มีงบ และแยกงบศูนย์ที่บันทึกไว้', () => {
    expect(budgetReport({...data, budgets: {}}, month)).toMatchObject({
      actual: 11_500_000, budget: undefined, difference: undefined, percent: undefined,
    });
    expect(cents('0', true)).toBe(0);
    expect(budgetReport({...data, budgets: {'2026-12': 0}}, '2026-12')).toEqual({
      actual: 0, budget: 0, difference: 0, percent: undefined, entries: [],
    });
  });

  it('เปลี่ยนเดือนแล้วใช้เฉพาะงบและรายการในเดือนที่เลือก', () => {
    const entry = {...data.entries[1], id: 'next-month', date: '2026-12-01', amount: 100};
    const input = {...data, entries: [...data.entries, entry], budgets: {...data.budgets, '2027-01': 5000}};
    expect(budgetReport(input, month).actual).toBe(11_500_000);
    expect(budgetReport(input, '2026-12')).toMatchObject({actual: 100, budget: undefined, entries: [entry]});
    expect(budgetReport(input, '2027-01')).toEqual({actual: 0, budget: 5000, difference: -5000, percent: -100, entries: []});
  });
});
