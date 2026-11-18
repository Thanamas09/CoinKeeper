import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {cents,initial,validate,totals,mergeData,readData,writeData,csv,validDate,type Data} from './data';
const fixture=():Data=>({...structuredClone(initial),entries:[{id:'one',amount:10001,type:'income',categoryId:'salary',date:'2026-11-17',note:'เงินเดือน'},{id:'two',amount:3025,type:'expense',categoryId:'food',date:'2026-11-17',note:'อาหาร'}],budgets:{'2026-11':20000}});
describe('การคำนวณและไฟล์สำรอง',()=>{
 it('แปลงสตางค์แม่นยำและปฏิเสธจำนวนเงินไม่ถูกต้อง',()=>{expect(cents('0.29')).toBe(29);expect(cents('1234.5')).toBe(123450);for(const x of ['0','-1','1.001','abc','1e3','Infinity'])expect(()=>cents(x)).toThrow()});
 it('รวมยอดเป็นจำนวนเต็ม',()=>{const t=totals(fixture().entries);expect(t).toEqual({income:10001,expense:3025});expect(t.income-t.expense).toBe(6976)});
 it('ตรวจวันที่จริง',()=>{expect(validDate('2026-02-30')).toBe(false);expect(validDate('2024-02-29')).toBe(true);expect(validDate('')).toBe(false)});
 it('สำรองและตรวจข้อมูลก่อนกู้คืน',()=>{const d=fixture();expect(validate(JSON.parse(JSON.stringify(d)))).toEqual(d);const bad=fixture();bad.entries[0].categoryId='missing';expect(()=>validate(bad)).toThrow();const fractional=fixture();fractional.entries[0].amount=1.5;expect(()=>validate(fractional)).toThrow();expect(()=>validate({})).toThrow()});
 it('เพิ่มรวมไม่ซ้ำและเก็บข้อมูลปัจจุบันเมื่อ id ตรงกัน',()=>{const d=fixture();expect(mergeData(d,d).entries).toHaveLength(2);const b=fixture();b.entries[0].amount=20000;expect(mergeData(d,b).entries).toEqual(d.entries)});
 it('ส่งออก CSV ภาษาไทย escape และป้องกันสูตร',()=>{const d=fixture();d.entries[0].note='=SUM(1,2)';const result=csv(d);expect(result.startsWith('\uFEFF')).toBe(true);expect(result).toContain('100.01');expect(result).toContain('"\'=SUM(1,2)"')});
});
describe('IndexedDB',()=>{it('เพิ่ม แก้ไข ลบ และกู้คืนแบบแทนที่ โดยอ่านใหม่ทุกครั้ง',async()=>{await writeData(structuredClone(initial));expect((await readData()).entries).toHaveLength(0);const d=fixture();await writeData(d);expect(await readData()).toEqual(d);d.entries[1].amount=4050;await writeData(d);expect((await readData()).entries[1].amount).toBe(4050);d.entries=d.entries.filter(e=>e.id!=='two');await writeData(d);expect((await readData()).entries).toHaveLength(1);const backup=JSON.stringify(await readData());await writeData(structuredClone(initial));await writeData(validate(JSON.parse(backup)));expect(await readData()).toEqual(d)});});
