import {openDB} from 'idb';
export type Kind='income'|'expense';
export type Category={id:string;name:string;type:Kind};
export type Entry={id:string;amount:number;categoryId:string;date:string;note:string;type:Kind};
export type Data={version:1;categories:Category[];entries:Entry[];budgets:Record<string,number>};
export const initial:Data={version:1,categories:[['salary','เงินเดือน','income'],['other','รายรับอื่น ๆ','income'],['food','อาหาร','expense'],['travel','เดินทาง','expense'],['home','ที่พัก','expense'],['shopping','ช้อปปิ้ง','expense'],['misc','อื่น ๆ','expense']].map(([id,name,type])=>({id,name,type:type as Kind})),entries:[],budgets:{}};
export function cents(value:string){if(!/^\d+(\.\d{1,2})?$/.test(value))throw Error('กรอกจำนวนเงินเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง');const [a,b='']=value.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<=0||n>100000000000)throw Error('จำนวนเงินต้องมากกว่า 0 และไม่เกิน 1,000,000,000 บาท');return n;}
export const money=(n:number)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(n/100);
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export function validDate(s:unknown):s is string{return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1900-01-01'&&s<='9999-12-31'&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function totals(entries:Entry[]){return entries.reduce((a,e)=>{a[e.type]+=e.amount;return a},{income:0,expense:0});}
export function validate(raw:unknown):Data{
 const d=raw as Data;const fail=()=>{throw Error('ไฟล์สำรองไม่ถูกต้อง กรุณาใช้ JSON ที่ส่งออกจากพอดี')};
 if(!d||d.version!==1||!Array.isArray(d.categories)||!Array.isArray(d.entries)||!d.budgets||typeof d.budgets!=='object'||Array.isArray(d.budgets)||d.entries.length>100000||d.categories.length>1000) return fail();
 const ids=new Set<string>();for(const c of d.categories){if(!c||typeof c.id!=='string'||!c.id||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>60||!['income','expense'].includes(c.type))return fail();ids.add(c.id);}
 let total=0;const es=new Set<string>();for(const e of d.entries){if(!e||typeof e.id!=='string'||!e.id||es.has(e.id)||!Number.isSafeInteger(e.amount)||e.amount<=0||e.amount>100000000000||!validDate(e.date)||typeof e.note!=='string'||e.note.length>1000||!d.categories.some(c=>c.id===e.categoryId&&c.type===e.type))return fail();total+=e.amount;if(!Number.isSafeInteger(total))return fail();es.add(e.id);}
 for(const [k,v]of Object.entries(d.budgets)){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(k)||!Number.isSafeInteger(v)||v<=0||v>100000000000)return fail();}
 return {version:1,categories:d.categories.map(c=>({...c})),entries:d.entries.map(e=>({...e})),budgets:{...d.budgets}};
}
export function mergeData(a:Data,b:Data):Data{const categories=[...a.categories];const mapping=new Map<string,string>();for(const c of b.categories){const match=categories.find(x=>x.name===c.name&&x.type===c.type);const id=match?.id||crypto.randomUUID();mapping.set(c.id,id);if(!match)categories.push({...c,id});}const entries=[...a.entries];for(const e of b.entries){const mapped={...e,categoryId:mapping.get(e.categoryId)!};const existing=entries.find(x=>x.id===e.id);if(existing&&JSON.stringify(existing)===JSON.stringify(mapped))continue;entries.push({...mapped,id:existing?crypto.randomUUID():e.id});}return validate({version:1,categories,entries,budgets:{...b.budgets,...a.budgets}});}
const db=()=>openDB('pordee-money',1,{upgrade(d){d.createObjectStore('state');}});
export async function readData():Promise<Data>{return (await (await db()).get('state','data'))??structuredClone(initial);}
export async function writeData(data:Data){const d=await db();const tx=d.transaction('state','readwrite');await tx.store.put(validate(data),'data');await tx.done;}
export function csv(data:Data,entries=data.entries){const cell=(s:string)=>'"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';return '\uFEFF'+[['วันที่','ประเภท','หมวดหมู่','จำนวนเงิน (บาท)','บันทึก'],...entries.map(e=>[e.date,e.type==='income'?'รายรับ':'รายจ่าย',data.categories.find(c=>c.id===e.categoryId)?.name||'',(e.amount/100).toFixed(2),e.note])].map(row=>row.map(cell).join(',')).join('\r\n');}
