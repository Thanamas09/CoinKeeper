import {useState} from 'react';
import {balances,cents,money,type Data} from './data';

export function calculatePlan(limits:number[], target:number|undefined, days:number) {
  const available=limits.reduce((sum,limit)=>sum+limit,0);
  const planned=target??available;
  let shortfall=planned;
  const amounts=limits.map(limit=>{
    const amount=Math.min(limit,shortfall);
    shortfall-=amount;
    return amount;
  });
  const funded=planned-shortfall;
  return {available,planned,amounts,shortfall,funded,daily:Math.floor(funded/days)};
}

function daysLeftInMonth() {
  const now=new Date();
  return new Date(now.getFullYear(),now.getMonth()+1,0).getDate()-now.getDate()+1;
}

export function Planner({data,ready,openAccounts}:{data:Data;ready:boolean;openAccounts:()=>void}) {
  const [selected,setSelected]=useState<string[]>([]);
  const [caps,setCaps]=useState<Record<string,string>>({});
  const [target,setTarget]=useState('');
  const [days,setDays]=useState(()=>String(daysLeftInMonth()));
  const accounts=data.accounts.filter(a=>!a.archived);
  const active=selected.flatMap(id=>accounts.filter(a=>a.id===id));
  const current=balances(data);
  const daysValid=/^\d+$/.test(days)&&Number(days)>=1&&Number(days)<=366;
  function parseAmount(s:string) {
    try {return s.trim()?cents(s.trim(),true):undefined}
    catch {return NaN}
  }
  const targetAmount=parseAmount(target);
  const amountError='กรอกจำนวนเงิน 0 ถึง 1 พันล้านบาท ทศนิยมไม่เกิน 2 ตำแหน่ง';
  const sources=active.map(account=>{
    const balance=current.accounts.get(account.id)??0;
    const limit=parseAmount(caps[account.id]??'')??balance;
    return {account,limit,error:Number.isNaN(limit)?amountError:limit>balance?'วงเงินเกินยอดบัญชี':''};
  });
  const plan=active.length&&daysValid&&!Number.isNaN(targetAmount)&&sources.every(s=>!s.error)
    ?calculatePlan(sources.map(s=>s.limit),targetAmount,Number(days)):null;

  if(!ready)return null;
  if(!accounts.length)return <section className="panel empty"><h2>ยังไม่มีบัญชีที่ใช้งาน</h2>
    <p>เพิ่มบัญชีหรือเปิดใช้บัญชีที่เก็บถาวรเพื่อเริ่มวางแผน</p>
    <button className="secondary" onClick={openAccounts}>ไปที่บัญชีและกระเป๋า</button>
  </section>;

  return <div className="planner">
    <section className="panel planner-setup">
      <h2>ตั้งแผนใช้เงิน</h2>
      <div className="planner-fields">
        <label className="field">จำนวนเงินที่ต้องการใช้ (บาท)
          <input inputMode="decimal" placeholder="เว้นว่างเพื่อใช้วงเงินทั้งหมด" value={target} onChange={e=>setTarget(e.target.value)} aria-invalid={Number.isNaN(targetAmount)}/>
          {Number.isNaN(targetAmount)&&<small className="expense">{amountError}</small>}
        </label>
        <label className="field">จำนวนวัน
          <input type="number" min="1" max="366" step="1" value={days} onChange={e=>setDays(e.target.value)} aria-invalid={!daysValid}/>
          <small className={daysValid?'muted':'expense'}>{daysValid?'ค่าเริ่มต้นนับวันนี้ถึงสิ้นเดือน':'กรอกจำนวนเต็มระหว่าง 1–366 วัน'}</small>
        </label>
      </div>
      <fieldset className="planner-sources">
        <legend>บัญชีที่จะใช้</legend>
        <p className="help">ระบบใช้วงเงินตามลำดับที่เลือก เว้นวงเงินไว้เพื่อใช้ยอดทั้งบัญชี รวมกระเป๋าย่อย</p>
        {accounts.map(account=>{
          const id=account.id;
          const i=active.findIndex(a=>a.id===id);
          const error=sources[i]?.error;
          return <div className="planner-source" key={id}>
            <label className="planner-account">
              <input type="checkbox" checked={i>=0} onChange={e=>{const checked=e.target.checked;setSelected(ids=>checked?[...ids,id]:ids.filter(x=>x!==id))}}/>
              <span><strong>{account.name}</strong><small className="muted">ยอดบัญชี {money(current.accounts.get(id)??0)}{i>=0&&' · ลำดับ '+(i+1)}</small></span>
            </label>
            {i>=0&&<label className="field planner-limit">วงเงินจาก {account.name} (บาท)
              <input inputMode="decimal" placeholder="ใช้ยอดทั้งหมด" value={caps[id]??''} onChange={e=>setCaps({...caps,[id]:e.target.value})} aria-invalid={!!error}/>
              {error&&<small className="expense">{error}</small>}
            </label>}
          </div>
        })}
      </fieldset>
    </section>
    <section className="panel planner-result">
      <h2>ผลคำนวณ</h2>
      <div aria-live="polite">
        {plan?<><div className="planner-daily">
          <span>ใช้ได้เฉลี่ยต่อวัน</span><strong>{money(plan.daily)}</strong>
          <small>สำหรับ {Number(days)} วัน · ปัดลงเป็นสตางค์</small>
        </div>
        <dl className="planner-breakdown">
          <div><dt>วงเงินรวมที่เลือก</dt><dd>{money(plan.available)}</dd></div>
          <div><dt>ใช้ได้ตามแผน</dt><dd>{money(plan.funded)}</dd></div>
          {plan.shortfall>0&&<div className="expense"><dt>ขาดจากเป้าหมาย</dt><dd>{money(plan.shortfall)}</dd></div>}
        </dl>
        {plan.shortfall>0&&<p className="help">เพิ่มวงเงิน เลือกบัญชีเพิ่ม หรือลดเป้าหมาย</p>}
        <h3>ใช้เงินจากแต่ละบัญชี</h3>
        <dl className="planner-breakdown">
          {active.map((a,i)=><div key={a.id}><dt>{a.name}</dt><dd>{money(plan.amounts[i])}</dd></div>)}
        </dl></>:<p className="help">{active.length?'ตรวจตัวเลขที่กรอกเพื่อคำนวณต่อ':'เลือกอย่างน้อยหนึ่งบัญชีเพื่อเริ่มคำนวณ'}</p>}
      </div>
      <p className="planner-footnote muted">เครื่องคิดเลขใช้จำลองแผนเท่านั้น</p>
    </section>
  </div>;
}
