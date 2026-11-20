import {ChevronLeft, ChevronRight} from 'lucide-react';

export function MonthPicker({month, setMonth}: {month: string; setMonth: (month: string) => void}) {
  function shift(offset: number) {
    const date = new Date(month + '-01T12:00:00');
    date.setMonth(date.getMonth() + offset);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  return <div className="month-picker">
    <button className="icon" aria-label="เดือนก่อนหน้า" disabled={month === '1900-01'} onClick={() => shift(-1)}><ChevronLeft size={17}/></button>
    <input className="month-input" aria-label="เลือกเดือนและปี" type="month" min="1900-01" max="9999-12"
      value={month} onChange={event => {
        const value = event.target.value;
        if (value && event.target.validity.valid) setMonth(value);
      }}/>
    <button className="icon" aria-label="เดือนถัดไป" disabled={month === '9999-12'} onClick={() => shift(1)}><ChevronRight size={17}/></button>
  </div>;
}
