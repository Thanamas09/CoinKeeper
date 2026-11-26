import 'fake-indexeddb/auto';
import {openDB} from 'idb';
import {describe,expect,it} from 'vitest';
import {balances, cents, csv, initial, mergeData, readData, removeAccount, removeWallet, setAccountBalance, totals, validate, writeData, type Data, type Entry, type Transfer} from './data';

const base = ():Data => ({
  ...structuredClone(initial),
  accounts:[
    {id:'a',name:'กสิกร',color:'#207d67',opening:100000,wallets:true},
    {id:'b',name:'SCB',color:'#654890',opening:20000,wallets:false},
  ],
  wallets:[{id:'food-wallet',accountId:'a',name:'ค่ากิน',categoryId:'food'}],
});
const unallocated = {accountId:'a'};
const food = {accountId:'a',walletId:'food-wallet'};
const savings = {accountId:'b'};
const movement = {date:'2026-10-01',note:''};
const allocation:Transfer = {...movement,id:'allocation',from:unallocated,to:food,amount:30000};
const transfer:Transfer = {...movement,id:'transfer',from:unallocated,to:savings,amount:20000};
const expense:Entry = {...movement,...food,id:'expense',type:'expense',categoryId:'food',amount:7500};
const fixture = ():Data => ({...base(),transfers:[allocation,transfer],entries:[expense]});

describe('บัญชี กระเป๋า และรายงาน', () => {
  it('ลบกระเป๋าที่มียอดโดยคืนยอดไปยังบัญชีและรักษาการโอนข้ามบัญชี', () => {
    const data = validate({...fixture(),transfers:[allocation,{...transfer,from:food}]});
    const next = validate(removeWallet(data,food.walletId));
    expect(next.wallets).toEqual([]);
    expect(next.entries).toStrictEqual([{...movement,id:'expense',accountId:'a',type:'expense',categoryId:'food',amount:7500}]);
    expect(next.transfers).toEqual([transfer]);
    expect(balances(next).accounts).toEqual(balances(data).accounts);
    expect(balances(next).at(unallocated)).toBe(72500);
  });
  it('ลบบัญชีพร้อมกระเป๋าและการโอนที่เกี่ยวข้อง โดยเก็บรายจ่ายในรายงาน', () => {
    const data = validate(fixture());
    const next = validate(removeAccount(data,unallocated.accountId));
    expect(next.accounts).toEqual([data.accounts[1]]);
    expect(next.wallets).toEqual([]);
    expect(next.transfers).toEqual([]);
    expect(next.entries).toStrictEqual([{...movement,id:'expense',type:'expense',categoryId:'food',amount:7500}]);
    expect(totals(next.entries)).toEqual(totals(data.entries));
    expect(balances(next).at(savings)).toBe(20000);
  });
  it('ตั้งยอดบัญชีใหม่โดยคืนเงินจากกระเป๋าเฉพาะส่วนที่จำเป็นและเก็บรายการเดิม', () => {
    const data = validate(fixture());
    const reset = validate(setAccountBalance(data,data.accounts[0],55043));
    expect(balances(reset).accounts.get('a')).toBe(55043);
    expect(balances(reset).at(food)).toBe(22500);
    const lower = validate(setAccountBalance(reset,reset.accounts[0],10000));
    expect(balances(lower).accounts.get('a')).toBe(10000);
    expect(balances(lower).at(food)).toBe(10000);
    expect(balances(lower).at(unallocated)).toBe(0);
    expect(balances(lower).at(savings)).toBe(40000);
    expect(lower.entries).toEqual(data.entries);
    expect(lower.transfers.slice(0,data.transfers.length)).toEqual(data.transfers);
    const zero = validate(setAccountBalance(lower,lower.accounts[0],0));
    expect(balances(zero).accounts.get('a')).toBe(0);
  });
  it('ยอดตั้งต้นไม่ก่อให้เกิดรายรับ และตรวจสอบทศนิยมและขอบเขต', () => {
    const data = validate(base());
    expect(totals(data.entries)).toEqual({income:0,expense:0});
    expect(balances(data).total).toBe(120000);
    expect(cents('0.00',true)).toBe(0);
    for (const input of ['-1','1.000','90071992547409.92','1e4']) expect(() => cents(input,true)).toThrow();
  });
  it('จัดสรรเงินในบัญชีเดิม และการโอนทั้งสองแบบอยู่นอกรายงานรายเดือน', () => {
    const data = validate({...base(),transfers:[allocation]});
    const current = balances(data);
    expect(current.at(food)).toBe(30000);
    expect(current.at(unallocated)).toBe(70000);
    expect(current.accounts.get('a')).toBe(100000);
    const posted = validate({...data,transfers:[allocation,transfer]});
    expect(totals(posted.entries.filter(e => e.date.startsWith('2026-10')))).toEqual({income:0,expense:0});
    expect(balances(posted).total).toBe(current.total);
    expect([...balances(posted).accounts.values()]).toEqual([80000,40000]);
  });
  it('รายจ่ายลดทั้งยอดกระเป๋าและบัญชีเพียงครั้งเดียว ยอดจริงสะสมข้ามเดือน', () => {
    const data = validate(fixture());
    const current = balances(data);
    expect(current.at(food)).toBe(22500);
    expect(current.at(unallocated)+current.at(food)).toBe(72500);
    expect(current.accounts.get('a')).toBe(72500);
    expect(current.total).toBe(112500);
    expect(totals(data.entries.filter(e => e.date.startsWith('2026-11'))).expense).toBe(0);
  });
  it('แก้ไขและลบเงินโอนและรายจ่าย โดยคำนวณทั้งสองด้านใหม่', () => {
    const data = fixture();
    const edited = balances(validate({...data,entries:[{...expense,amount:5000}],transfers:[allocation,{...transfer,amount:10000}]}));
    expect([edited.accounts.get('a'),edited.accounts.get('b'),edited.at(food)]).toEqual([85000,30000,25000]);
    const removed = balances(validate({...data,entries:[],transfers:[allocation]}));
    expect([removed.accounts.get('a'),removed.accounts.get('b'),removed.at(food)]).toEqual([100000,20000,30000]);
  });
  it('ปฏิเสธยอดไม่พอในแหล่งเงินเดิม ปลายทางซ้ำ และความสัมพันธ์ผิด', () => {
    const data = fixture();
    expect(() => validate({...data,entries:[{...expense,amount:31000}]})).toThrow(/เงินใน.*ไม่พอ/);
    expect(() => validate({...data,transfers:[{...transfer,from:food}]})).toThrow(/เงินใน.*ไม่พอ/);
    expect(() => validate({...data,transfers:[{...transfer,to:unallocated}]})).toThrow();
    expect(() => validate({...data,transfers:[{...transfer,to:{...savings,walletId:food.walletId}}]})).toThrow();
    expect(() => validate({...data,transfers:[{...transfer,to:undefined}]})).toThrow();
  });
  it('สำรอง JSON เพิ่มรวมซ้ำได้ รวมถึงไฟล์ที่ซ้อนทับกับรายการที่แก้แล้ว และส่งออก CSV สองด้าน', () => {
    const data = validate(fixture());
    const imported = validate(JSON.parse(JSON.stringify(data)));
    expect(imported).toEqual(data);
    expect(mergeData(data,imported)).toEqual(data);
    const edited = validate({...data,transfers:[allocation,{...transfer,amount:12345}]});
    expect(mergeData(edited,imported)).toEqual(edited);
    const disjoint = mergeData({...data,transfers:[allocation]},imported);
    expect(disjoint).toEqual(data);
    const output = csv(data);
    for (const s of ['บัญชีต้นทาง','กระเป๋าปลายทาง','ค่ากิน','SCB','ย้ายเงินระหว่างกระเป๋า']) expect(output).toContain(s);
  });
});

it('อัปเกรด IndexedDB เวอร์ชัน 1 รักษารายงาน ผูกย้อนหลังเอง และกู้คืนได้หลังเปิดฐานใหม่', async () => {
  const old = {
    version:1, categories:initial.categories, budgets:{'2026-10':40000},
    entries:[{...movement,id:'old',type:'expense',categoryId:'food',amount:7500}],
  };
  const db = await openDB('pordee-money',1,{upgrade(database){database.createObjectStore('state')}});
  await db.put('state',old,'data');
  db.close();

  const migrated = await readData();
  expect(migrated.version).toBe(2);
  expect(migrated.accounts).toEqual([]);
  expect(migrated.entries).toEqual(old.entries);
  expect(migrated.budgets).toEqual(old.budgets);
  expect(totals(migrated.entries).expense).toBe(7500);
  expect(balances(migrated).total).toBe(0);
  const upgraded = await openDB('pordee-money',2);
  expect((await upgraded.get('state','data')).version).toBe(2);
  upgraded.close();

  const restoredOld = validate(JSON.parse(JSON.stringify(old)));
  expect(restoredOld).toEqual(migrated);
  expect(mergeData(fixture(),restoredOld).entries).toHaveLength(2);
  const bound = validate({...base(),budgets:migrated.budgets,entries:[{...migrated.entries[0],...unallocated}]});
  expect(balances(bound).accounts.get('a')).toBe(92500);
  expect(mergeData(bound,restoredOld).entries).toEqual(bound.entries);
  await writeData(bound,migrated);
  await expect(writeData(initial,migrated)).rejects.toThrow(/อีกแท็บ/);

  const restoredNew = validate(JSON.parse(JSON.stringify(fixture())));
  await writeData(restoredNew,bound);
  expect(await readData()).toEqual(restoredNew);
  await expect(writeData({...restoredNew,transfers:[{...transfer,amount:999999}]},restoredNew)).rejects.toThrow(/ไม่พอ/);
  expect(await readData()).toEqual(restoredNew);
  await writeData(mergeData(restoredNew,restoredOld),restoredNew);
  expect((await readData()).entries).toHaveLength(2);
  expect(balances(await readData()).total).toBe(112500);
});
