import {useState, type FormEvent} from 'react';
import {ArrowUpRight, ChartPie, Wallet} from 'lucide-react';
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

function AccountBudgets({data, month, entries, busy, save, showEntries}: {
  data: Data; month: string; entries: Entry[]; busy: boolean; save?: Save;
  showEntries: (accountId: string | null) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const budget = data.budgets[month];
  const allocations = data.accountBudgets?.[month] ?? {};
  const spent = new Map<string | undefined, number>();
  for (const entry of entries) spent.set(entry.accountId, (spent.get(entry.accountId) ?? 0) + entry.amount);
  const accounts = data.accounts.filter(account => !account.archived || Object.hasOwn(allocations, account.id) || spent.has(account.id));
  const remaining = budget === undefined ? undefined : budget - Object.values(allocations).reduce((sum, amount) => sum + amount, 0);

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
      {!draft && accounts.length > 0 && budget !== undefined && save && <button className="secondary" disabled={busy}
        onClick={() => {
          setError('');
          setDraft(Object.fromEntries(Object.entries(allocations).map(([id, amount]) => [id, (amount / 100).toFixed(2)])));
        }}>แบ่งงบให้บัญชี</button>}
    </div>
    {budget === undefined && <p className="help">ตั้งงบรวมของเดือนนี้ในหน้า งบประมาณ เพื่อเริ่มแบ่งงบให้บัญชี</p>}
    {!accounts.length && <p className="help">เพิ่มบัญชีในหน้า บัญชีและกระเป๋า เพื่อแบ่งงบ</p>}
    {draft && <p className="help">กรอกงบเป็นบาท ยอดรวมต้องอยู่ในงบเดือนนี้ เว้นช่องว่างเพื่อล้างงบของบัญชี</p>}
    <form onSubmit={submit}>
      {(accounts.length > 0 || spent.has(undefined)) && <div className="table-wrap"><table>
        <thead><tr><th scope="col">บัญชี</th><th scope="col" className="right">งบที่แบ่ง</th>
          <th scope="col" className="right">จ่ายจริง</th><th scope="col" className="right">เทียบกับงบ</th></tr></thead>
        <tbody>{accounts.map(account => {
          const allocation = Object.hasOwn(allocations, account.id) ? allocations[account.id] : undefined;
          const actual = spent.get(account.id) ?? 0;
          const remaining = allocation === undefined ? undefined : allocation - actual;
          return <tr key={account.id}>
            <th scope="row">{account.name}{account.archived && ' (เก็บถาวร)'}</th>
            <td className="right">{draft ? <input inputMode="decimal" value={Object.hasOwn(draft, account.id) ? draft[account.id] : ''}
              disabled={busy} aria-label={`งบสำหรับ ${account.name} (บาท)`}
              onChange={event => setDraft({...draft, [account.id]: event.target.value})}/>
              : allocation === undefined ? 'ยังไม่แบ่ง' : money(allocation)}</td>
            <td className="right"><button type="button" className="text-button" aria-controls="actual-entries"
              aria-label={`ดูรายจ่ายของ ${account.name}`} onClick={() => showEntries(account.id)}>{money(actual)}</button></td>
            <td className={`right ${remaining !== undefined && remaining < 0 ? 'expense' : ''}`}>
              {remaining === undefined ? '—' : remaining < 0 ? `เกิน ${money(-remaining)}` : `เหลือ ${money(remaining)}`}
            </td>
          </tr>;
        })}{spent.has(undefined) && <tr>
          <th scope="row">รายการที่ยังไม่ผูกบัญชี</th><td className="right">—</td>
          <td className="right"><button type="button" className="text-button" aria-controls="actual-entries"
            aria-label="ดูรายจ่ายที่ยังไม่ผูกบัญชี" onClick={() => showEntries(null)}>{money(spent.get(undefined)!)}</button></td>
          <td className="right">—</td>
        </tr>}</tbody>
      </table></div>}
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

export function BudgetReport({data, busy = false, save, initialMonth}: {
  data: Data; busy?: boolean; save?: Save; initialMonth?: string;
}) {
  const [month, setMonth] = useState(() => initialMonth ?? today().slice(0, 7));
  const [scope, setScope] = useState<{accountId?: string | null} | null>(null);
  const {budget, actual, difference, percent, entries} = budgetReport(data, month);
  const expanded = scope !== null && scope.accountId === undefined;
  const shownEntries = scope?.accountId === undefined ? entries
    : entries.filter(entry => (entry.accountId ?? null) === scope.accountId);
  const scopeName = scope?.accountId === null ? 'ยังไม่ผูกบัญชี'
    : data.accounts.find(account => account.id === scope?.accountId)?.name;
  const status = difference === undefined ? 'ยังไม่ได้ตั้งงบ'
    : difference > 0 ? 'เกินงบ' : difference < 0 ? 'ต่ำกว่างบ' : 'เท่างบ';
  const rate = percent === undefined ? '—' : percentage.format(percent / 100);

  return <>
    <div className="period-row"><MonthPicker month={month} setMonth={next => {setMonth(next);setScope(null)}}/></div>
    <section className="summary" aria-label="สรุปงบเทียบยอดจ่ายจริง">
      <div className="stat">
        <div className="stat-top">งบค่าใช้จ่ายรวม<span className="stat-icon green"><Wallet size={21}/></span></div>
        {budget === undefined ? <p>ยังไม่ได้ตั้งงบ</p> : <strong>{money(budget)}</strong>}
      </div>
      <div className="stat">
        <div className="stat-top">ยอดจ่ายจริง<span className="stat-icon red"><ArrowUpRight size={21}/></span></div>
        <button className="actual-toggle" aria-label={`ยอดจ่ายจริง ${money(actual)}`} aria-controls="actual-entries"
          aria-expanded={expanded} onClick={() => setScope(expanded ? null : {})}><strong>{money(actual)}</strong></button>
        <button className="secondary" aria-controls="actual-entries" aria-expanded={expanded}
          onClick={() => setScope(expanded ? null : {})}>{expanded ? 'ซ่อนรายการที่รวมในยอดจริง' : 'ดูรายการที่รวมในยอดจริง'}</button>
      </div>
      <div className="stat report-difference" aria-live="polite">
        <div className="stat-top">ผลต่างจากงบ<span className="stat-icon green"><ChartPie size={21}/></span></div>
        {difference === undefined ? <p>{status}</p> : <>
          <strong className={difference > 0 ? 'expense' : difference < 0 ? 'income' : undefined}>
            {status} {differenceBaht.format(Math.abs(difference) / 100)} บาท ({rate})
          </strong>
          <small>ผลต่าง {difference > 0 ? '+' : ''}{money(difference)}</small>
        </>}
      </div>
    </section>
    <AccountBudgets key={month} data={data} month={month} entries={entries} busy={busy} save={save}
      showEntries={accountId => setScope(scope?.accountId === accountId ? null : {accountId})}/>
    <section id="actual-entries" className="panel transactions report-entries" hidden={scope === null} aria-labelledby="actual-entries-title">
      <div className="panel-heading">
        <h2 id="actual-entries-title">{scopeName ? `รายจ่าย · ${scopeName}` : 'รายการที่รวมในยอดจริง'}</h2>
        <span className="count">{shownEntries.length} รายการ</span>
      </div>
      {shownEntries.length ? <div className="table-wrap"><table>
        <thead><tr><th>วันที่</th><th>รายละเอียด</th><th>หมวดหมู่</th><th>บัญชี</th><th className="right">จำนวนเงิน</th></tr></thead>
        <tbody>{shownEntries.map(entry => <tr key={entry.id}>
          <td>{dateLabel(entry.date)}</td>
          <td>{entry.description || entry.note || '—'}{entry.description && entry.note && <div className="muted">{entry.note}</div>}</td>
          <td>{data.categories.find(category => category.id === entry.categoryId)?.name ?? '—'}</td>
          <td>{locationLabel(data, entry.accountId ? {accountId: entry.accountId, walletId: entry.walletId} : undefined)}</td>
          <td className="right amount">{money(entry.amount)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty">ไม่มีรายการค่าใช้จ่ายในเดือนนี้</p>}
      <div className="table-footer"><span>ยอดรวมรายการ</span><b>{money(totals(shownEntries).expense)}</b></div>
    </section>
  </>;
}
