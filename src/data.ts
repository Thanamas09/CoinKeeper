import {openDB} from 'idb';

export type Kind = 'income' | 'expense';
export type Category = {id:string; name:string; type:Kind};
export type Location = {accountId:string; walletId?:string};
export type Account = {id:string; name:string; color:string; opening:number; balanceAdjustment?:number; wallets:boolean; archived?:boolean};
export type Pocket = {id:string; accountId:string; name:string; categoryId?:string; archived?:boolean};
type Movement = {id:string; amount:number; date:string; note:string};
export type Entry = Movement & {categoryId:string; type:Kind; description?:string; accountId?:string; walletId?:string};
export type Transfer = Movement & {from:Location; to:Location};
export type Data = {
  version:2; categories:Category[]; entries:Entry[]; budgets:Record<string,number>;
  accountBudgets?:Record<string,Record<string,number>>;
  accounts:Account[]; wallets:Pocket[]; transfers:Transfer[];
};

export const unallocated = 'เงินที่ยังไม่จัดสรร';
export const legacyLabel = 'รายการเดิมที่ยังไม่ผูกบัญชี';
export const initial:Data = {
  version:2,
  categories:[
    {id:'salary',name:'เงินเดือน',type:'income'},
    {id:'other',name:'รายรับอื่น ๆ',type:'income'},
    {id:'food',name:'อาหาร',type:'expense'},
    {id:'travel',name:'เดินทาง',type:'expense'},
    {id:'home',name:'ที่พัก',type:'expense'},
    {id:'shopping',name:'ช้อปปิ้ง',type:'expense'},
    {id:'misc',name:'อื่น ๆ',type:'expense'},
  ],
  entries:[], budgets:{}, accounts:[], wallets:[], transfers:[],
};

const maxAmount = 100_000_000_000;
const validAmount = (n:number, minimum = 1) => Number.isSafeInteger(n) && n >= minimum && n <= maxAmount;
export function cents(value:string, allowZero = false) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw Error('กรอกจำนวนเงินเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง');
  const [whole, fraction=''] = value.split('.');
  const n = Number(whole)*100 + Number(fraction.padEnd(2,'0'));
  if (!validAmount(n, allowZero ? 0 : 1)) throw Error(allowZero
    ? 'จำนวนเงินต้องอยู่ระหว่าง 0 ถึง 1,000,000,000 บาท'
    : 'จำนวนเงินต้องมากกว่า 0 และไม่เกิน 1,000,000,000 บาท');
  return n;
}
const baht = new Intl.NumberFormat('th-TH');
export const decimal = (n:number) => `${n < 0 ? '-' : ''}${Math.trunc(Math.abs(n)/100)}.${String(Math.abs(n)%100).padStart(2,'0')}`;
export const money = (n:number) => {
  const [whole, fraction] = decimal(n).split('.');
  return `${n < 0 ? '-' : ''}฿${baht.format(Number(whole.slice(n < 0 ? 1 : 0)))}.${fraction}`;
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export const dateLabel = (s:string) => new Date(s+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
export function validDate(s:unknown):s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s < '1900-01-01' || s > '9999-12-31') return false;
  const date = new Date(s+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === s;
}
export function totals(entries:Entry[]) {
  return entries.reduce((a,e) => {a[e.type] += e.amount; return a}, {income:0,expense:0});
}

export const sameLocation = (a:Location,b:Location) => a.accountId === b.accountId && a.walletId === b.walletId;
export function removeAccount(data:Data, accountId:string):Data {
  const accountBudgets = {...data.accountBudgets};
  for (const [month, allocations] of Object.entries(accountBudgets)) {
    if (!Object.hasOwn(allocations,accountId)) continue;
    const next = {...allocations};
    delete next[accountId];
    if (Object.keys(next).length) accountBudgets[month] = next;
    else delete accountBudgets[month];
  }
  return {
    ...data,
    accounts:data.accounts.filter(a => a.id !== accountId),
    wallets:data.wallets.filter(w => w.accountId !== accountId),
    entries:data.entries.map(e => e.accountId === accountId ? {...e,accountId:undefined,walletId:undefined} : e),
    transfers:data.transfers.filter(t => t.from.accountId !== accountId && t.to.accountId !== accountId),
    ...(data.accountBudgets ? {accountBudgets} : {}),
  };
}

export function removeWallet(data:Data, walletId:string):Data {
  const unassign = (place:Location):Location => place.walletId === walletId ? {accountId:place.accountId} : place;
  return {
    ...data,
    wallets:data.wallets.filter(w => w.id !== walletId),
    entries:data.entries.map(e => e.walletId === walletId ? {...e,walletId:undefined} : e),
    transfers:data.transfers.map(t => ({...t,from:unassign(t.from),to:unassign(t.to)}))
      .filter(t => !sameLocation(t.from,t.to)),
  };
}

export function locationLabel(data:Data, location?:Location) {
  if (!location) return legacyLabel;
  const account = data.accounts.find(a => a.id === location.accountId);
  if (!account) return legacyLabel;
  const wallet = data.wallets.find(w => w.id === location.walletId);
  return account.wallets ? `${account.name} / ${wallet?.name ?? unallocated}` : account.name;
}

export function balances(data:Data) {
  const accounts = new Map(data.accounts.map(a => [a.id, a.opening + (a.balanceAdjustment ?? 0)]));
  if ([...accounts.values()].some(amount => !Number.isSafeInteger(amount))) throw Error('ยอดรวมเกินขอบเขตที่ระบบคำนวณได้อย่างแม่นยำ');
  const available = new Map(accounts);
  const wallets = new Map(data.wallets.map(w => [w.id, 0]));
  function add(map:Map<string,number>, id:string, delta:number) {
    const result = (map.get(id) ?? 0) + delta;
    if (!Number.isSafeInteger(result)) throw Error('ยอดรวมเกินขอบเขตที่ระบบคำนวณได้อย่างแม่นยำ');
    map.set(id,result);
  }
  function post(place:Location, delta:number, changesAccount = true) {
    if (changesAccount) add(accounts,place.accountId,delta);
    if (place.walletId) add(wallets,place.walletId,delta);
    else add(available,place.accountId,delta);
  }
  for (const e of data.entries) if (e.accountId) post({accountId:e.accountId,walletId:e.walletId}, e.type === 'income' ? e.amount : -e.amount);
  for (const t of data.transfers) {
    const external = t.from.accountId !== t.to.accountId;
    post(t.from,-t.amount,external);
    post(t.to,t.amount,external);
  }
  const total = [...accounts.values()].reduce((sum,n) => sum+n,0);
  if (!Number.isSafeInteger(total)) throw Error('ยอดรวมเกินขอบเขตที่ระบบคำนวณได้อย่างแม่นยำ');
  return {accounts,available,wallets,total, at:(p:Location) => (p.walletId ? wallets.get(p.walletId) : available.get(p.accountId)) ?? 0};
}

export function setAccountBalance(data:Data, account:Account, target:number):Data {
  const current = balances(data);
  const place = {accountId:account.id};
  const delta = target - (current.accounts.get(account.id) ?? 0);
  const balanceAdjustment = (account.balanceAdjustment ?? 0) + delta;
  const transfers = [...data.transfers];
  let shortfall = Math.max(0,-(current.at(place) + delta));
  const date = today();
  for (const wallet of data.wallets) {
    if (shortfall === 0) break;
    if (wallet.accountId !== account.id) continue;
    const from = {...place,walletId:wallet.id};
    let remaining = Math.min(shortfall,current.at(from));
    while (remaining > 0) {
      const amount = Math.min(remaining,maxAmount);
      transfers.push({id:crypto.randomUUID(),from,to:place,date,amount,note:'คืนเงินเข้าบัญชีเพื่อเริ่มยอดใหม่'});
      remaining -= amount;
      shortfall -= amount;
    }
  }
  return {...data,transfers,accounts:data.accounts.map(a => a.id === account.id ? {...account,balanceAdjustment} : a)};
}

const validId = (id:unknown):id is string => typeof id === 'string' && id.length > 0;
const validName = (name:unknown) => typeof name === 'string' && !!name.trim() && name.length <= 60;
const isKind = (kind:unknown) => kind === 'income' || kind === 'expense';
const validArchived = (value:unknown) => value === undefined || typeof value === 'boolean';
function invalid():never { throw Error('ไฟล์หรือข้อมูลไม่ถูกต้อง กรุณาตรวจสอบจำนวนเงินและความสัมพันธ์ของบัญชี กระเป๋า และหมวดหมู่'); }
function index<T extends {id:string}>(rows:T[], check:(row:T)=>boolean) {
  const items = new Map<string,T>();
  for (const row of rows) {
    if (!row || !validId(row.id) || items.has(row.id) || !check(row)) invalid();
    items.set(row.id,row);
  }
  return items;
}
export function validate(raw:unknown):Data {
  const source = raw as Omit<Data,'version'> & {version:number};
  if (!source || ![1,2].includes(source.version) || !Array.isArray(source.categories)
    || !Array.isArray(source.entries) || !source.budgets || typeof source.budgets !== 'object'
    || Array.isArray(source.budgets) || source.categories.length > 1000) invalid();
  const legacy = source.version === 1;
  const {categories,budgets} = source;
  const {accounts,wallets,transfers} = legacy ? initial : source;
  if (![accounts,wallets,transfers].every(Array.isArray) || source.entries.length + transfers.length > 100000) invalid();
  const categoryMap = index(categories,c => validName(c.name) && isKind(c.type));
  const accountMap = index(accounts,a => validName(a.name) && /^#[0-9a-f]{6}$/i.test(a.color)
    && validAmount(a.opening,0) && (a.balanceAdjustment === undefined || Number.isSafeInteger(a.balanceAdjustment)) && typeof a.wallets === 'boolean' && validArchived(a.archived));
  const walletMap = index(wallets,w => validName(w.name) && w.name.trim() !== unallocated
    && accountMap.get(w.accountId)?.wallets === true && validArchived(w.archived)
    && (w.categoryId === undefined || categoryMap.has(w.categoryId)));
  function validLocation(p:Location) {
    return p && accountMap.has(p.accountId) && (p.walletId === undefined || walletMap.get(p.walletId)?.accountId === p.accountId);
  }
  let volume = 0;
  function validMovement(e:Movement) {
    if (!validAmount(e.amount) || !validDate(e.date) || typeof e.note !== 'string' || e.note.length > 1000) return false;
    volume += e.amount;
    return Number.isSafeInteger(volume);
  }
  const entries = source.entries.map(e => {
    if (!e) invalid();
    const {id,amount,categoryId,date,note,type,description,accountId,walletId} = e;
    return {id,amount,categoryId,date,note,type,...(description !== undefined ? {description} : {}),...(!legacy && accountId !== undefined ? {accountId} : {}),
      ...(!legacy && walletId !== undefined ? {walletId} : {})};
  });
  index(entries,e => validMovement(e) && (e.description === undefined || (typeof e.description === 'string' && e.description.length <= 160))
    && isKind(e.type) && categoryMap.get(e.categoryId)?.type === e.type
    && (e.accountId === undefined ? e.walletId === undefined : validLocation({accountId:e.accountId,walletId:e.walletId})));
  index(transfers,t => validMovement(t) && validLocation(t.from) && validLocation(t.to) && !sameLocation(t.from,t.to));
  for (const [k,v] of Object.entries(budgets)) if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k) || !validAmount(v,0)) invalid();
  const accountBudgets = legacy ? undefined : source.accountBudgets;
  if (accountBudgets !== undefined) {
    if (!accountBudgets || typeof accountBudgets !== 'object' || Array.isArray(accountBudgets)) invalid();
    for (const [month, allocations] of Object.entries(accountBudgets)) {
      if (!Object.hasOwn(budgets,month) || !allocations || typeof allocations !== 'object' || Array.isArray(allocations)) invalid();
      let allocated = 0;
      for (const [accountId, amount] of Object.entries(allocations)) {
        if (!accountMap.has(accountId) || !validAmount(amount,0)) invalid();
        allocated += amount;
        if (allocated > budgets[month]) throw Error('งบที่แบ่งให้บัญชีรวมกันสูงกว่างบรวมของเดือน กรุณาปรับงบให้สอดคล้องกัน');
      }
    }
  }
  const result:Data = {version:2,categories,entries,budgets,accounts,wallets,transfers,
    ...(accountBudgets && Object.keys(accountBudgets).length ? {accountBudgets} : {})};
  const current = balances(result);
  for (const a of accounts) checkFunds(result,{accountId:a.id},current);
  for (const w of wallets) checkFunds(result,{accountId:w.accountId,walletId:w.id},current);
  return structuredClone(result);
}
function checkFunds(data:Data, place:Location, current:ReturnType<typeof balances>) {
  const amount = current.at(place);
  if (amount < 0) throw Error(`เงินใน ${locationLabel(data,place)} ไม่พออีก ${money(-amount)} กรุณาลดจำนวนเงิน เลือกแหล่งเงินอื่น หรือจัดสรรเงินเข้าที่นี่ก่อน`);
}

export function mergeData(current:Data, incoming:Data):Data {
  const categories = [...current.categories];
  const categoryIds = new Map<string,string>();
  for (const c of incoming.categories) {
    const match = categories.find(x => x.id === c.id)
      ?? categories.find(x => x.name === c.name && x.type === c.type);
    categoryIds.set(c.id,match?.id ?? c.id);
    if (!match) categories.push(c);
  }
  function combine<T extends {id:string}>(existing:T[], added:T[], compatible?:(a:T,b:T)=>boolean) {
    const rows = new Map(existing.map(row => [row.id,row]));
    for (const row of added) {
      const previous = rows.get(row.id);
      if (!previous) rows.set(row.id,row);
      else if (compatible && !compatible(previous,row)) throw Error('ไฟล์มีรหัสกระเป๋าที่ตรงกันแต่ผูกคนละบัญชี กรุณาตรวจสอบไฟล์สำรอง');
    }
    return [...rows.values()];
  }
  const wallets = incoming.wallets.map(w => ({...w,categoryId:w.categoryId ? categoryIds.get(w.categoryId) : undefined}));
  const entries = incoming.entries.map(e => ({...e,categoryId:categoryIds.get(e.categoryId)!}));
  const accountBudgets = {...incoming.accountBudgets};
  for (const month of Object.keys(current.budgets)) delete accountBudgets[month];
  Object.assign(accountBudgets,current.accountBudgets);
  return validate({
    version:2,categories,
    accounts:combine(current.accounts,incoming.accounts),
    wallets:combine(current.wallets,wallets,(a,b) => a.accountId === b.accountId),
    entries:combine(current.entries,entries),
    transfers:combine(current.transfers,incoming.transfers),
    budgets:{...incoming.budgets,...current.budgets},
    accountBudgets,
  });
}

const db = () => openDB('pordee-money',2,{
  upgrade(database,oldVersion,_,tx) {
    const store = oldVersion === 0 ? database.createObjectStore('state') : tx.objectStore('state');
    if (oldVersion === 1) {
      store.get('data').then(value => {
        if (value !== undefined) return store.put(validate(value),'data');
      }).catch(() => {try {tx.abort()} catch { /* Transaction already closed. */ }});
    }
  },
  blocking(_current,_next,event) { (event.target as IDBDatabase).close(); },
});
export async function readData():Promise<Data> {
  const database = await db();
  try { return validate((await database.get('state','data')) ?? initial); }
  finally { database.close(); }
}
export async function writeData(data:Data, expected?:Data) {
  const next = validate(data);
  const database = await db();
  try {
    const tx = database.transaction('state','readwrite');
    if (expected) {
      const stored = (await tx.store.get('data')) ?? initial;
      if (JSON.stringify(stored) !== JSON.stringify(expected)) {
        await tx.done;
        throw Error('ข้อมูลเปลี่ยนจากอีกแท็บ กรุณารีเฟรชแล้วลองอีกครั้ง');
      }
    }
    await tx.store.put(next,'data');
    await tx.done;
  } finally { database.close(); }
}

export function csv(data:Data, entries=data.entries, transfers=data.transfers) {
  const cell = (s:string) => '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';
  const location = (p?:Location):[string,string] => {
    const a = data.accounts.find(a => a.id === p?.accountId);
    return a ? [a.name, a.wallets ? data.wallets.find(w => w.id === p?.walletId)?.name ?? unallocated : ''] : ['',''];
  };
  const rows = [
    ['วันที่','ประเภท','หมวดหมู่','จำนวนเงิน (บาท)','บันทึก','บัญชี','กระเป๋า','บัญชีต้นทาง','กระเป๋าต้นทาง','บัญชีปลายทาง','กระเป๋าปลายทาง','รายการ'],
    ...entries.map(e => [e.date,e.type === 'income' ? 'รายรับ' : 'รายจ่าย',data.categories.find(c=>c.id===e.categoryId)?.name ?? '',
      decimal(e.amount),e.note,...(e.accountId ? location({accountId:e.accountId,walletId:e.walletId}) : [legacyLabel,'']),'','','','',e.description ?? '']),
    ...transfers.map(t => [t.date,t.from.accountId === t.to.accountId ? 'ย้ายเงินระหว่างกระเป๋า' : 'โอนเงิน','',
      decimal(t.amount),t.note,'','',...location(t.from),...location(t.to),'']),
  ];
  return '\uFEFF'+rows.map(row => row.map(cell).join(',')).join('\r\n');
}
