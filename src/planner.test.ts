import {describe,expect,it} from 'vitest';
import {calculatePlan} from './planner';

describe('เครื่องคิดเลขวางแผนใช้เงิน',()=>{
  it('ใช้วงเงินตามลำดับที่เลือกและหยุดเมื่อครบเป้าหมาย',()=>{
    const plan=calculatePlan([30000,60000,10000],50000,7);
    expect(plan.amounts).toEqual([30000,20000,0]);
    expect(plan.daily).toBe(7142);
    expect(plan.shortfall).toBe(0);
  });

  it('คิดค่าเฉลี่ยจากเงินที่ใช้ได้จริงเมื่อวงเงินไม่ถึงเป้า',()=>{
    expect(calculatePlan([1000,2000],5000,4)).toMatchObject({
      amounts:[1000,2000],funded:3000,shortfall:2000,daily:750,
    });
  });

  it('ใช้วงเงินรวมเมื่อไม่ได้ระบุเป้าหมาย และรับเป้าหมายศูนย์',()=>{
    expect(calculatePlan([0,5901],undefined,2)).toMatchObject({planned:5901,daily:2950});
    expect(calculatePlan([5901],0,2)).toMatchObject({amounts:[0],daily:0});
  });
});
