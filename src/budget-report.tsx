import {Fragment, useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {ArrowDown, ArrowUpRight, ChartPie, ChevronDown, Wallet} from 'lucide-react';
import {cents, dateLabel, locationLabel, money, today, totals, type Data, type Entry} from './data';
import {MonthPicker} from './month-picker';

export function budgetReport(data: Data, month: string) {
  const entries = data.entries
    .filter(entry => entry.type === 'expense' && entry.date.slice(0, 7) === month)
    .sort((a, b) => b.date.localeCompare(a.date));
  const actual = totals(entries).expense;
  const budget = data.budgets[month];
  const difference = budget === undefined ? undefined : actual - budget;
  const percent = difference !== undefined && budget > 0 ? difference / budget * 100 : undefined;
  return {budget, actual, difference, percent, entries};
}

const differenceBaht = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 2});
const percentage = new Intl.NumberFormat('th-TH', {
  style: 'percent', signDisplay: 'exceptZero', minimumFractionDigits: 1, maximumFractionDigits: 1,
});

type Save = (next: Data, onError: (message: string) => void) => Promise<boolean>;

function ExpenseList({data, entries}: {data: Data; entries: Entry[]}) {
  return <ul className="report-expenses">{entries.map(entry => <li key={entry.id}>
    <div>
      <strong>{entry.description || entry.note || 'รายการค่าใช้จ่าย'}</strong>
      {entry.description && entry.note && <span>{entry.note}</span>}
      <span>{dateLabel(entry.date)} · {data.categories.find(category => category.id === entry.categoryId)?.name ?? 'ไม่ระบุหมวด'}
        {' · '}{locationLabel(data, entry.accountId ? {accountId: entry.accountId, walletId: entry.walletId} : undefined)}</span>
    </div>
    <b className="expense">{money(entry.amount)}</b>
  </li>)}</ul>;
}

function AccountExpenses({data, entries}: {data: Data; entries: Entry[]}) {
  const categories = new Map<string, {total: number; entries: Entry[]}>();
  for (const entry of entries) {
    const category = categories.get(entry.categoryId) ?? {total: 0, entries: []};
    category.total += entry.amount;
    category.entries.push(entry);
    categories.set(entry.categoryId, category);
  }
  if (!entries.length) return <p>บัญชีนี้ยังไม่มีรายจ่ายในเดือนที่เลือก</p>;
  return <>
    <h3>รายจ่ายตามหมวด</h3>
    {[...categories].sort(([, a], [, b]) => b.total - a.total).map(([id, category]) => <details key={id}>
      <summary>
        <ChevronDown size={16} aria-hidden="true"/>
        <span>{data.categories.find(item => item.id === id)?.name ?? 'ไม่ระบุหมวด'}
          <small>ดู {category.entries.length} รายการ</small></span>
        <b className="expense">{money(category.total)}</b>
      </summary>
      <ExpenseList data={data} entries={category.entries}/>
    </details>)}
  </>;
}

function BudgetComparison({budget, actual}: {budget: number | undefined; actual: number}) {
  if (budget === undefined) return <span className="report-muted">ยังไม่แบ่งงบ</span>;
  const gap = budget - actual;
  const scale = Math.max(budget, actual, 1);
  return <>
    <strong className={gap < 0 ? 'report-over' : 'report-green'}>
      {gap < 0 ? 'เกิน' : 'เหลือ'} {money(Math.abs(gap))}
    </strong>
    <div className="budget-track" aria-hidden="true">
      <span className={gap < 0 ? 'over' : ''} style={{width: `${actual / scale * 100}%`}}/>
      <i style={{left: `${budget / scale * 100}%`}}/>
    </div>
  </>;
}

function AccountBudgets({data, month, byAccount, busy, save, jump}: {
  data: Data; month: string; byAccount: Map<string | null, Entry[]>; busy: boolean; save?: Save;
  jump: {id: string} | null;
}) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null | undefined>();
  const jumpButton = useRef<HTMLButtonElement>(null);
  const tableId = useId();
  const budget = data.budgets[month];
  const allocations = data.accountBudgets?.[month] ?? {};
  const accounts: {id: string | null; name: string}[] = data.accounts
    .filter(account => !account.archived || Object.hasOwn(allocations, account.id) || byAccount.has(account.id))
    .map(account => ({id: account.id, name: account.name + (account.archived ? ' (เก็บถาวร)' : '')}));
  if (byAccount.has(null)) accounts.push({id: null, name: 'รายการที่ยังไม่ผูกบัญชี'});
  const remaining = budget === undefined ? undefined : budget - Object.values(allocations).reduce((sum, amount) => sum + amount, 0);

  useEffect(() => {
    if (!jump) return;
    setExpanded(jump.id);
    jumpButton.current?.focus({preventScroll: true});
    jumpButton.current?.closest('tr')?.scrollIntoView({block: 'start'});
  }, [jump]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!save || !draft || budget === undefined) return;
    setError('');
    try {
      const next = Object.fromEntries(Object.entries(draft)
        .filter(([, value]) => value.trim() !== '')
        .map(([id, value]) => [id, cents(value.trim(), true)]));
      if (Object.values(next).reduce((sum, amount) => sum + amount, 0) > budget) {
        throw Error(`ยอดแบ่งงบรวมต้องไม่เกิน ${money(budget)}`);
      }
      const accountBudgets = {...data.accountBudgets};
      if (Object.keys(next).length) accountBudgets[month] = next;
      else delete accountBudgets[month];
      if (await save({...data, accountBudgets}, setError)) setDraft(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return <section className="panel account-budgets" aria-labelledby="account-budgets-title">
    <div className="panel-heading">
      <div>
        <h2 id="account-budgets-title">งบแยกตามบัญชี</h2>
        {remaining !== undefined && <p className="help">งบรวมที่ยังไม่ได้แบ่ง <b>{money(remaining)}</b></p>}
      </div>
      {!draft && accounts.some(account => account.id !== null) && budget !== undefined && save && <button className="primary" disabled={busy}
        onClick={() => {
          setError('');
          setDraft(Object.fromEntries(Object.entries(allocations).map(([id, amount]) => [id, (amount / 100).toFixed(2)])));
        }}>แบ่งงบให้บัญชี</button>}
    </div>
    {budget === undefined && <p className="help">ตั้งงบรวมของเดือนนี้เพื่อเริ่มแบ่งงบให้บัญชี</p>}
    {!accounts.some(account => account.id !== null) && <p className="help">เพิ่มบัญชีในหน้า บัญชีและกระเป๋า เพื่อแบ่งงบ</p>}
    {draft && <p className="help">กรอกงบเป็นบาท ยอดรวมต้องอยู่ในงบเดือนนี้ เว้นช่องว่างเพื่อล้างงบของบัญชี</p>}
    <form onSubmit={submit}>
      {accounts.length > 0 && <table className="account-report-table" role="table">
        <colgroup><col/><col/><col/><col className="comparison-column"/></colgroup>
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">บัญชี</th><th scope="col" role="columnheader" className="right">งบที่แบ่ง</th>
          <th scope="col" role="columnheader" className="right">จ่ายจริง</th><th scope="col" role="columnheader" className="right">เทียบกับงบ</th></tr></thead>
        <tbody role="rowgroup">{accounts.map(({id, name}, index) => {
          const allocation = id === null || !Object.hasOwn(allocations, id) ? undefined : allocations[id];
          const accountEntries = byAccount.get(id) ?? [];
          const actual = totals(accountEntries).expense;
          const open = expanded === id;
          const detailsId = `${tableId}-${index}`;
          const toggle = () => setExpanded(open ? undefined : id);
          return <Fragment key={id === null ? 'unassigned' : `account:${id}`}>
            <tr role="row" className="account-report-row" aria-labelledby={`${detailsId}-name`}
              onClick={event => {if (!(event.target as HTMLElement).closest('button, input')) toggle()}}>
              <th scope="row" role="rowheader"><button type="button" id={`${detailsId}-name`} className="account-disclosure"
                ref={id === jump?.id ? jumpButton : undefined} aria-expanded={open} aria-controls={detailsId} onClick={toggle}>
                <ChevronDown size={17} aria-hidden="true"/>{name}
              </button></th>
              <td className="right" role="cell"><span className="account-mobile-label" aria-hidden="true">งบที่แบ่ง</span>
                {draft && id !== null ? <input inputMode="decimal" value={Object.hasOwn(draft, id) ? draft[id] : ''}
                  disabled={busy} aria-label={`งบสำหรับ ${name} (บาท)`}
                  onChange={event => setDraft({...draft, [id]: event.target.value})}/>
                  : allocation === undefined ? '—' : money(allocation)}</td>
              <td className="right" role="cell"><span className="account-mobile-label" aria-hidden="true">จ่ายจริง</span><b className="expense">{money(actual)}</b></td>
              <td className="right" role="cell"><span className="account-mobile-label" aria-hidden="true">เทียบกับงบ</span>
                {id === null ? '—' : <BudgetComparison budget={allocation} actual={actual}/>}</td>
            </tr>
            <tr role="row" id={detailsId} className="account-report-details" hidden={!open}>
              <td role="cell" colSpan={4}>{open && <AccountExpenses data={data} entries={accountEntries}/>}</td>
            </tr>
          </Fragment>;
        })}</tbody>
      </table>}
      {Object.keys(allocations).length > 0 && <p className="help budget-track-key"><i aria-hidden="true"/>ขีดบอกตำแหน่งงบที่แบ่ง</p>}
      {draft && <>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="account-actions spaced">
          <button className="primary" disabled={busy}>บันทึกการแบ่งงบ</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setDraft(null)}>ยกเลิก</button>
        </div>
      </>}
    </form>
  </section>;
}

export function BudgetReport({data, busy = false, save, initialMonth, onSetBudget}: {
  data: Data; busy?: boolean; save?: Save; initialMonth?: string; onSetBudget?: (month: string) => void;
}) {
  const [month, setMonth] = useState(() => initialMonth ?? today().slice(0, 7));
  const [expanded, setExpanded] = useState(false);
  const [jump, setJump] = useState<{id: string} | null>(null);
  const {budget, actual, difference, percent, entries} = budgetReport(data, month);
  const allocations = data.accountBudgets?.[month] ?? {};
  const byAccount = new Map<string | null, Entry[]>();
  for (const entry of entries) {
    const id = entry.accountId ?? null;
    if (!byAccount.has(id)) byAccount.set(id, []);
    byAccount.get(id)!.push(entry);
  }
  let highestOverage: {id: string; name: string; amount: number} | undefined;
  for (const account of data.accounts) {
    if (!Object.hasOwn(allocations, account.id)) continue;
    const amount = totals(byAccount.get(account.id) ?? []).expense - allocations[account.id];
    if (amount > (highestOverage?.amount ?? 0)) highestOverage = {id: account.id, name: account.name, amount};
  }
  const status = difference === undefined ? 'ยังไม่ได้ตั้งงบ'
    : difference > 0 ? 'เกินงบ' : difference < 0 ? 'ต่ำกว่างบ' : 'เท่างบ';
  const rate = percent === undefined ? '' : ` (${percentage.format(percent / 100)})`;

  return <div className="budget-report">
    <div className="period-row"><MonthPicker month={month} setMonth={next => {setMonth(next);setExpanded(false);setJump(null)}}/></div>
    <section className="report-overview" aria-labelledby="report-overview-title">
      <span className="report-overview-icon"><ChartPie size={22} aria-hidden="true"/></span>
      <div className="report-overview-copy" aria-live="polite">
        <h2 id="report-overview-title" className={difference !== undefined && difference > 0 ? 'report-over' : 'report-green'}>
          {difference === undefined ? 'เดือนนี้ยังไม่ได้ตั้งงบ'
            : difference > 0 ? `เดือนนี้เกินงบ ${money(difference)}`
            : difference < 0 ? `เดือนนี้อยู่ในงบ เหลือ ${money(-difference)}` : 'เดือนนี้ใช้จ่ายเท่ากับงบ'}
        </h2>
        {highestOverage && <p><b>{highestOverage.name}</b> เกินงบมากที่สุด <b className="report-over">{money(highestOverage.amount)}</b></p>}
        {!entries.length && <p>ยังไม่มีรายจ่ายในเดือนนี้ กดเพิ่มรายการเพื่อบันทึกรายจ่าย โดยเลือกวันที่ในเดือนนี้</p>}
        {difference === undefined && <p>ตั้งงบประมาณของเดือนนี้เพื่อเปรียบเทียบยอดจ่ายจริง</p>}
        {difference !== undefined && entries.length > 0 && !highestOverage &&
          <p>{Object.keys(allocations).length ? 'ดูยอดและรายการรายจ่ายแยกตามบัญชีด้านล่าง' : 'แบ่งงบให้บัญชีด้านล่างเพื่อเทียบรายจ่ายของแต่ละบัญชี'}</p>}
      </div>
      {highestOverage && <button type="button" className="secondary" onClick={() => setJump({id: highestOverage.id})}>
        ดูรายการบัญชีนี้ <ArrowDown size={16} aria-hidden="true"/>
      </button>}
      {onSetBudget && <button type="button" className="secondary" disabled={busy} onClick={() => onSetBudget(month)}>
        {budget === undefined ? 'ตั้งงบประมาณ' : 'แก้ไขงบประมาณ'}
      </button>}
    </section>
    <section className="summary" aria-label="สรุปงบเทียบยอดจ่ายจริง">
      <div className="stat stat-budget">
        <div className="stat-top">งบค่าใช้จ่ายรวม<span className="stat-icon"><Wallet size={21}/></span></div>
        {budget === undefined ? <p>ยังไม่ได้ตั้งงบ</p> : <strong>{money(budget)}</strong>}
      </div>
      <div className="stat stat-expense">
        <div className="stat-top">ยอดจ่ายจริง<span className="stat-icon red"><ArrowUpRight size={21}/></span></div>
        <button className="actual-toggle" aria-label={`ยอดจ่ายจริง ${money(actual)}`} aria-controls="actual-entries"
          aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><strong>{money(actual)}</strong></button>
        <button className="report-entry-toggle" aria-controls="actual-entries" aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}>{expanded ? 'ซ่อนรายการที่รวมในยอดจริง' : 'ดูรายการที่รวมในยอดจริง'} <ChevronDown size={14} aria-hidden="true"/></button>
      </div>
      <div className="stat report-difference" aria-live="polite">
        <div className="stat-top">ผลต่างจากงบ<span className="stat-icon budget-icon"><ChartPie size={21}/></span></div>
        {difference === undefined ? <p>{status}</p> : <>
          <strong className={difference > 0 ? 'report-over' : 'report-green'}>
            {status} {differenceBaht.format(Math.abs(difference) / 100)} บาท{rate}
          </strong>
          <small>ผลต่าง {difference > 0 ? '+' : ''}{money(difference)}</small>
        </>}
      </div>
    </section>
    <section id="actual-entries" className="panel report-entries" hidden={!expanded} aria-labelledby="actual-entries-title">
      <div className="panel-heading">
        <h2 id="actual-entries-title">รายการที่รวมในยอดจริง</h2>
        <span className="help">{entries.length} รายการ</span>
      </div>
      {expanded && (entries.length ? <ExpenseList data={data} entries={entries}/> : <p className="help">ไม่มีรายการค่าใช้จ่ายในเดือนนี้</p>)}
      <div className="table-footer"><span>ยอดรวมรายการ</span><b className="expense">{money(actual)}</b></div>
    </section>
    <AccountBudgets key={month} data={data} month={month} byAccount={byAccount} busy={busy} save={save} jump={jump}/>
  </div>;
}
