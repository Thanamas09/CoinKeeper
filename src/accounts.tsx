import {useState, type FormEvent, type ReactNode} from 'react';
import {ArrowRightLeft, Plus, Trash2, Wallet, X} from 'lucide-react';
import {balances, cents, dateLabel, decimal, legacyLabel, locationLabel, money, removeAccount, removeWallet, sameLocation, today, unallocated,
  type Account, type Data, type Entry, type Location, type Pocket, type Transfer} from './data';

export function LocationFields({data,value,onChange,label='บัญชี',allowed,required=true}:{data:Data;value?:Location;
  onChange:(value?:Location)=>void;label?:string;allowed?:Location;required?:boolean}) {
  const account = data.accounts.find(a => a.id === value?.accountId);
  const accountChoices = data.accounts.filter(a => !a.archived || a.id === allowed?.accountId);
  const walletChoices = data.wallets.filter(w => w.accountId === account?.id && (!w.archived || w.id === allowed?.walletId));
  return <>
    <label className="field">{label}<select required={required} value={account?.id ?? ''} onChange={e => onChange(e.target.value
      ? {accountId:e.target.value} : undefined)}>
      <option value="">เลือกบัญชี</option>
      {accountChoices.map(a => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (เก็บถาวร)' : ''}</option>)}
    </select></label>
    {account?.wallets && <label className="field">กระเป๋า {label === 'บัญชี' ? '' : label.replace('บัญชี','')}
      <select value={value?.walletId ?? ''} onChange={e => onChange({accountId:account.id,walletId:e.target.value || undefined})}>
        <option value="">{unallocated}</option>
        {walletChoices.map(w => <option key={w.id} value={w.id}>{w.name}{w.archived ? ' (เก็บถาวร)' : ''}</option>)}
      </select>
    </label>}
  </>;
}

function Dialog({title,close,error,children}:{title:string;close:()=>void;error:string;children:ReactNode}) {
  return <div className="modal-backdrop" onClick={e => {if (e.target === e.currentTarget) close()}}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel-heading"><h2>{title}</h2><button className="icon" onClick={close} aria-label="ปิดหน้าต่าง"><X size={20}/></button></div>
      {error && <p className="error" role="alert">{error}</p>}
      {children}
    </section>
  </div>;
}

type Save = (next:Data,onError?:(message:string)=>void)=>Promise<boolean>;

export function TransferForm({data,item,source,defaultDate,close,save,busy,error,setError}:{data:Data;item?:Transfer;source?:Location;defaultDate?:string;
  close:()=>void;save:Save;busy:boolean;error:string;setError:(s:string)=>void}) {
  const [from,setFrom] = useState(item?.from ?? source);
  const [to,setTo] = useState(item?.to);
  const [amount,setAmount] = useState(item ? decimal(item.amount) : '');
  const [date,setDate] = useState(item?.date ?? defaultDate ?? today());
  const [note,setNote] = useState(item?.note ?? '');
  const available = balances(data);
  const sourceBalance = from ? available.at(from) + (item && sameLocation(item.from,from) ? item.amount : 0)
    - (item && sameLocation(item.to,from) ? item.amount : 0) : 0;
  async function submit(event:FormEvent) {
    event.preventDefault();
    setError('');
    try {
      if (!from || !to) throw Error('กรุณาเลือกต้นทางและปลายทาง');
      if (sameLocation(from,to)) throw Error('กรุณาเลือกต้นทางและปลายทางคนละที่');
      const value:Transfer = {id:item?.id ?? crypto.randomUUID(),amount:cents(amount),date,note:note.trim(),from,to};
      if (await save({...data,transfers:item ? data.transfers.map(t => t.id === item.id ? value : t) : [...data.transfers,value]})) close();
    } catch (e) { setError((e as Error).message) }
  }
  return <Dialog title={item ? 'แก้ไขการโอน' : 'โอนเงิน / ย้ายกระเป๋า'} close={close} error={error}>
    <form onSubmit={submit}>
      <p className="help">เลือกกระเป๋าคนละใบในบัญชีเดียวกันเพื่อจัดสรรเงิน การโอนและจัดสรรเงินแสดงในประวัติบัญชี</p>
      <LocationFields data={data} value={from} onChange={setFrom} label="บัญชีต้นทาง" allowed={item?.from}/>
      {from && <p className="help">ยอดที่ใช้ได้จากต้นทาง {money(sourceBalance)}</p>}
      <LocationFields data={data} value={to} onChange={setTo} label="บัญชีปลายทาง" allowed={item?.to}/>
      <label className="field">จำนวนเงิน (บาท)<input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label>
      <label className="field">วันที่<input required type="date" min="1900-01-01" max="9999-12-31" value={date} onChange={e => setDate(e.target.value)}/></label>
      <label className="field">บันทึก<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)}/></label>
      <button className="primary full" disabled={busy}>บันทึกการโอน</button>
      {item && <button type="button" className="text-button danger full" disabled={busy} onClick={async () => {
        if (confirm(`ลบการโอน ${money(item.amount)} วันที่ ${dateLabel(item.date)} ใช่ไหม?`)
          && await save({...data,transfers:data.transfers.filter(t => t.id !== item.id)})) close();
      }}>ลบการโอน</button>}
    </form>
  </Dialog>;
}

function AccountForm({item,canDisable,commit}:{item?:Account;canDisable:boolean;commit:(a:Account)=>void}) {
  const [name,setName] = useState(item?.name ?? '');
  const [color,setColor] = useState(item?.color ?? '#207d67');
  const [opening,setOpening] = useState(decimal(item?.opening ?? 0));
  const [wallets,setWallets] = useState(item?.wallets ?? false);
  const [error,setError] = useState('');
  return <form onSubmit={e => {
    e.preventDefault();
    try {
      if (!name.trim()) throw Error('กรุณาระบุชื่อบัญชี');
      commit({...item,id:item?.id ?? crypto.randomUUID(),name:name.trim(),color,opening:cents(opening,true),wallets});
    } catch (e) {setError((e as Error).message)}
  }}>
    {error && <p className="error" role="alert">{error}</p>}
    <label className="field">ชื่อบัญชี<input autoFocus required maxLength={60} value={name} onChange={e => setName(e.target.value)}/></label>
    <label className="field">สีบัญชี<input type="color" value={color} onChange={e => setColor(e.target.value)}/></label>
    <label className="field">ยอดตั้งต้น (บาท)<input required inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)}/></label>
    <p className="help">ถ้าจะผูกรายการย้อนหลัง ให้ใช้ยอดก่อนรายการแรกที่จะผูก หากเริ่มจากยอดเงินจริงวันนี้ ให้ผูกเฉพาะรายการที่ยังไม่ได้สะท้อนในยอดนั้น เพื่อเลี่ยงการนับซ้ำ</p>
    <label className="radio"><input type="checkbox" checked={wallets} disabled={!canDisable} onChange={e => setWallets(e.target.checked)}/> ใช้กระเป๋าย่อยในบัญชีนี้</label>
    {!canDisable && <p className="help">ลบกระเป๋าย่อยทั้งหมดก่อนปิดการใช้กระเป๋า</p>}
    <button className="primary full">บันทึกบัญชี</button>
  </form>;
}

function WalletForm({data,item,accountId,commit}:{data:Data;item?:Pocket;accountId:string;commit:(w:Pocket)=>void}) {
  const [name,setName] = useState(item?.name ?? '');
  const [categoryId,setCategory] = useState(item?.categoryId ?? '');
  return <form onSubmit={e => {
    e.preventDefault();
    commit({...item,id:item?.id ?? crypto.randomUUID(),accountId,name:name.trim(),categoryId:categoryId || undefined});
  }}>
    <label className="field">ชื่อกระเป๋า<input autoFocus required maxLength={60} value={name} onChange={e => setName(e.target.value)}/></label>
    <label className="field">หมวดหมู่เริ่มต้น<select value={categoryId} onChange={e => setCategory(e.target.value)}>
      <option value="">เลือกเองตอนบันทึกรายการ</option>
      {data.categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type === 'expense' ? 'รายจ่าย' : 'รายรับ'})</option>)}
    </select></label>
    <p className="help">กระเป๋าคือเงินจริงที่จัดสรรไว้ ส่วนงบประมาณคือเพดานรายจ่ายของเดือน</p>
    <button className="primary full">บันทึกกระเป๋า</button>
  </form>;
}

type Editor = {type:'account';item?:Account} | {type:'wallet';item?:Pocket};

export function AccountsPage({data,save,ready,busy,openEntry,openTransfer}:{data:Data;save:Save;ready:boolean;busy:boolean;
  openEntry:(e:Entry)=>void;openTransfer:(t?:Transfer,source?:Location)=>void}) {
  const [selected,setSelected] = useState('');
  const [editor,setEditor] = useState<Editor>();
  const [formError,setFormError] = useState('');
  const account = data.accounts.find(a => a.id === selected);
  const current = balances(data);
  const wallets = data.wallets.filter(w => w.accountId === selected);
  const entries = data.entries.filter(e => e.accountId === selected);
  const transfers = data.transfers.filter(t => t.from.accountId === selected || t.to.accountId === selected);
  const legacy = data.entries.filter(e => !e.accountId).sort((a,b) => b.date.localeCompare(a.date));
  const history = [
    ...entries.map(item => ({item, label:locationLabel(data,{accountId:selected,walletId:item.walletId}),
      value:money(item.type === 'expense' ? -item.amount : item.amount), edit:() => openEntry(item)})),
    ...transfers.map(item => ({item, label:`${locationLabel(data,item.from)} → ${locationLabel(data,item.to)}`,
      value:item.from.accountId === item.to.accountId ? money(item.amount) : money(item.from.accountId === selected ? -item.amount : item.amount),
      edit:() => openTransfer(item)})),
  ].sort((a,b) => b.item.date.localeCompare(a.item.date));
  function show(value:Editor) {setFormError('');setEditor(value)}
  async function commit(next:Data) {
    if (busy) return;
    setFormError('');
    try {
      if (await save(next,setFormError)) setEditor(undefined);
    } catch (e) {setFormError((e as Error).message)}
  }
  function accountActions(a:Account) {
    return <>
      <button className="secondary" onClick={() => show({type:'account',item:a})}>แก้ไขบัญชี</button>
      <button className="secondary" disabled={busy} onClick={() => save({...data,accounts:data.accounts.map(x => x.id === a.id ? {...x,archived:!x.archived} : x)})}>{a.archived ? 'เปิดใช้งานอีกครั้ง' : 'เก็บถาวร'}</button>
      <button className="text-button danger" disabled={busy} onClick={async () => {
        const details = [
          `ยอด ${money(current.accounts.get(a.id) ?? 0)} จะถูกนำออกจากบัญชีที่ติดตาม`,
          wallets.length ? `กระเป๋าย่อย ${wallets.length} ใบจะถูกลบด้วย` : '',
          entries.length ? `รายรับและรายจ่าย ${entries.length} รายการจะยังอยู่ในรายงาน แต่จะถูกยกเลิกการผูกบัญชี` : '',
          transfers.length ? `ประวัติโอนและย้ายเงิน ${transfers.length} รายการจะถูกลบ ซึ่งอาจเปลี่ยนยอดบัญชีอื่น` : '',
          Object.values(data.accountBudgets ?? {}).some(allocations => Object.hasOwn(allocations,a.id))
            ? 'งบที่แบ่งให้บัญชีนี้จะกลับไปเป็นงบที่ยังไม่ได้แบ่ง' : '',
        ].filter(Boolean);
        if (confirm([`ลบบัญชี “${a.name}” ใช่ไหม?`, ...details].join('\n'))
          && await save(removeAccount(data,a.id))) setSelected(value => value === a.id ? '' : value);
      }}><Trash2 size={15}/> ลบบัญชี</button>
    </>;
  }
  function walletActions(w:Pocket) {
    return <>
      <button className="text-button" onClick={() => show({type:'wallet',item:w})}>แก้ไข</button>
      <button className="text-button" disabled={busy} onClick={() => save({...data,wallets:data.wallets.map(x => x.id === w.id ? {...x,archived:!x.archived} : x)})}>{w.archived ? 'เปิดใช้งาน' : 'เก็บถาวร'}</button>
      <button className="text-button danger" disabled={busy} onClick={() => {
        if (confirm(`ลบกระเป๋า “${w.name}” ใช่ไหม?\nยอด ${money(current.wallets.get(w.id) ?? 0)} และรายการจะย้ายไปที่${unallocated} การย้ายเงินที่กลายเป็นต้นทางและปลายทางเดียวกันจะถูกลบ`)) {
          void save(removeWallet(data,w.id));
        }
      }}><Trash2 size={15}/> ลบกระเป๋า</button>
    </>;
  }
  return <div className="account-page">
    <section className="panel account-total">
      <div><span className="muted">ยอดเงินจริงรวมทุกบัญชี</span><strong>{money(current.total)}</strong><p className="help">ยอดสะสมจากข้อมูลที่คุณบันทึกในเบราว์เซอร์นี้ ไม่มีการเชื่อมต่อธนาคาร</p></div>
      <div className="account-actions">
        <button className="primary" disabled={!ready || busy} onClick={() => show({type:'account'})}><Plus size={17}/> เพิ่มบัญชี</button>
        <button className="secondary" disabled={busy || !data.accounts.some(a => !a.archived)} onClick={() => openTransfer()}><ArrowRightLeft size={17}/> โอนเงิน</button>
      </div>
    </section>
    {data.accounts.length ? <div className="account-grid">{data.accounts.map(a => <button type="button" key={a.id}
      className="panel account-card" aria-pressed={selected === a.id} onClick={() => setSelected(a.id)}>
      <span className="account-icon" style={{background:a.color}}><Wallet size={18}/></span>
      <span><b>{a.name}</b><small>{a.archived ? 'เก็บถาวร' : a.wallets ? 'ใช้กระเป๋าย่อย' : 'บัญชีเดี่ยว'}</small></span>
      <strong>{money(current.accounts.get(a.id) ?? 0)}</strong>
    </button>)}</div> : <section className="panel empty"><h3>ยังไม่มีบัญชี</h3><p>เพิ่มบัญชีธนาคารหรือเงินสดที่คุณต้องการติดตาม</p><button className="secondary" disabled={!ready} onClick={() => show({type:'account'})}>เริ่มเพิ่มบัญชี</button></section>}
    {account && <section className="panel account-detail">
      <div className="account-row"><div><h2>{account.name}</h2><p className="help">ยอดตั้งต้น {money(account.opening)}</p></div><div className="account-actions">{accountActions(account)}</div></div>
      {account.wallets && <>
        <div className="account-row"><h3>กระเป๋าในบัญชี</h3><div className="account-actions">
          <button className="secondary" onClick={() => show({type:'wallet'})}><Plus size={16}/> เพิ่มกระเป๋า</button>
          <button className="secondary" disabled={account.archived || busy} onClick={() => openTransfer(undefined,{accountId:account.id})}>จัดสรรเงิน</button>
        </div></div>
        <div className="ledger-row"><span>{unallocated}</span><b>{money(current.available.get(account.id) ?? 0)}</b></div>
        {wallets.map(w => <div className="ledger-row" key={w.id}><span>{w.name}{w.archived && ' (เก็บถาวร)'}
          {w.categoryId && <small className="muted">{data.categories.find(c => c.id === w.categoryId)?.name}</small>}</span>
          <b>{money(current.wallets.get(w.id) ?? 0)}</b><div className="account-actions">{walletActions(w)}</div>
        </div>)}
        {!wallets.length && <p className="help">ยังไม่มีกระเป๋าย่อย เพิ่มกระเป๋าเพื่อเริ่มจัดสรรเงิน</p>}
      </>}
      <h3 className="ledger-title">ประวัติบัญชีทุกเดือน</h3>
      {history.map(({item,label,value,edit}) => <div className="ledger-row" key={('from' in item ? 't' : 'e')+item.id}>
        <span>{label}<small className="muted">{dateLabel(item.date)} · {'from' in item
          ? item.from.accountId === item.to.accountId ? 'ย้ายกระเป๋า' : 'โอนเงิน'
          : data.categories.find(c => c.id === item.categoryId)?.name}{'description' in item && item.description && ' · '+item.description}{item.note && ' · '+item.note}</small></span>
        <b>{value}</b><button className="text-button" onClick={edit}>ดู / แก้ไข</button>
      </div>)}
      {!history.length && <p className="help">ยังไม่มีรายการในบัญชีนี้</p>}
    </section>}
    {legacy.length > 0 && <section className="panel account-detail">
      <h2>{legacyLabel}</h2><p className="help">รายการเหล่านี้ยังรวมในรายงานรายเดือน เลือกรายการเพื่อดูผลต่อยอดเงินจริงก่อนผูกบัญชี</p>
      {!data.accounts.some(a => !a.archived) && <p className="help">เพิ่มบัญชีที่ใช้งานก่อนผูกรายการ</p>}
      {legacy.map(e => <div className="ledger-row" key={e.id}>
        <span>{data.categories.find(c => c.id === e.categoryId)?.name}<small className="muted">{dateLabel(e.date)}{e.description && ' · '+e.description}{e.note && ' · '+e.note}</small></span>
        <b>{money(e.type === 'expense' ? -e.amount : e.amount)}</b>
        <button className="text-button" disabled={!data.accounts.some(a => !a.archived)} onClick={() => openEntry(e)}>เลือกบัญชี</button>
      </div>)}
    </section>}
    {editor && <Dialog title={editor.type === 'account' ? editor.item ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี' : editor.item ? 'แก้ไขกระเป๋า' : 'เพิ่มกระเป๋า'} close={() => setEditor(undefined)} error={formError}>
      {editor.type === 'account'
        ? <AccountForm item={editor.item} canDisable={!wallets.length || !editor.item} commit={a => {
          setSelected(a.id);
          void commit({...data,accounts:editor.item ? data.accounts.map(x => x.id === a.id ? a : x) : [...data.accounts,a]});
        }}/>
        : account && <WalletForm data={data} item={editor.item} accountId={account.id} commit={w => {
          if (!w.name || w.name === unallocated) {setFormError('กรุณาระบุชื่อกระเป๋าอื่น');return}
          void commit({...data,wallets:editor.item ? data.wallets.map(x => x.id === w.id ? w : x) : [...data.wallets,w]});
        }}/>}
    </Dialog>}
  </div>;
}
