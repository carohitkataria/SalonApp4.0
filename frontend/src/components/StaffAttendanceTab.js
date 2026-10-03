import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  Calendar, ChevronLeft, ChevronRight, Check, X, Clock, DollarSign, 
  Loader2, AlertCircle, CheckCircle, Banknote, CreditCard, Building
} from 'lucide-react';
import { motion } from 'framer-motion';
import LeaveBalanceCard from '@/components/leave/LeaveBalanceCard';
import AttendanceCellDialog from '@/components/attendance/AttendanceCellDialog';
import { isCheckInMode } from '@/lib/attendance';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_COLORS = {
  present: 'bg-green-500 text-white',
  half_day: 'bg-yellow-500 text-black',
  absent: 'bg-red-500 text-white',
  holiday: 'bg-purple-500 text-white',
  on_leave: 'bg-blue-500 text-white',
  future: 'bg-muted text-muted-foreground'
};

const STATUS_LABELS = {
  present: 'P',
  half_day: 'H',
  absent: 'A',
  holiday: '🎉',
  on_leave: 'L'
};

export default function StaffAttendanceTab({ salonId, barberId, barberName, compensation }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [attendance, setAttendance] = useState([]);
  const [attMode, setAttMode] = useState(null);
  const [salary, setSalary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [earlyPayConfirm, setEarlyPayConfirm] = useState(false); // Item 3a — pre-month-end confirm
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNote, setPaymentNote] = useState('');
  // Per-cell edit dialog
  const [editDialog, setEditDialog] = useState({ open: false, dateStr: null });
  // Active leave records (with leave_type_code) for current month
  const [leaveRecords, setLeaveRecords] = useState([]);
  // Barber's employment dates + per-date leave list
  const [leaveInfo, setLeaveInfo] = useState({ doj: null, last_working_date: null, leave_dates: [] });

  const token = localStorage.getItem('salon_admin_token') || 
    JSON.parse(localStorage.getItem('salon_user_auth') || '{}')?.token;

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const fetchAttendanceData = useCallback(async () => {
    if (!salonId || !barberId) return;
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/salons/${salonId}/staff-attendance/month/${currentMonth}?barber_id=${barberId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const barberData = response.data.barbers?.find(b => b.barber_id === barberId);
      setAttendance(barberData?.attendance || []);
      setAttMode(response.data.attendance_mode);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  }, [salonId, barberId, currentMonth, token]);

  const fetchSalaryData = useCallback(async () => {
    if (!salonId || !barberId) return;
    try {
      const response = await axios.get(
        `${API}/salons/${salonId}/staff-salary/month/${currentMonth}?barber_id=${barberId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const salaryRecord = response.data.salary_records?.find(s => s.barber_id === barberId);
      setSalary(salaryRecord);
    } catch (error) {
      console.error('Error fetching salary:', error);
    }
  }, [salonId, barberId, currentMonth, token]);

  const fetchLeaveInfo = useCallback(async () => {
    if (!salonId || !barberId) return;
    try {
      const response = await axios.get(
        `${API}/salons/${salonId}/barbers/${barberId}/leave-dates`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLeaveInfo({
        doj: response.data.doj || null,
        last_working_date: response.data.last_working_date || null,
        leave_dates: response.data.leave_dates || [],
      });
    } catch (error) {
      console.error('Error fetching leave info:', error);
    }
  }, [salonId, barberId, token]);

  const fetchLeaveRecords = useCallback(async () => {
    if (!salonId || !barberId) return;
    try {
      // Pull a wide window covering current month for active leave records
      const monthStart = `${currentMonth}-01`;
      const [y, m] = currentMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
      const response = await axios.get(
        `${API}/salons/${salonId}/leave-records?barber_id=${barberId}&from=${monthStart}&to=${monthEnd}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLeaveRecords(response.data.records || []);
    } catch (error) {
      console.error('Error fetching leave records:', error);
      setLeaveRecords([]);
    }
  }, [salonId, barberId, currentMonth, token]);

  useEffect(() => {
    fetchAttendanceData();
    fetchSalaryData();
    fetchLeaveInfo();
    fetchLeaveRecords();
  }, [fetchAttendanceData, fetchSalaryData, fetchLeaveInfo, fetchLeaveRecords]);

  const handleCalculateAttendance = async () => {
    // Item 3b — Auto-Calculate: run all days in parallel, surface API errors,
    // and refetch attendance + salary after completion.
    const endDay = currentMonth === todayStr.slice(0, 7) ? today.getDate() : daysInMonth;
    setLoading(true);
    try {
      const calls = [];
      for (let day = 1; day <= endDay; day++) {
        const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
        calls.push(
          axios.post(
            `${API}/salons/${salonId}/staff-attendance/calculate/${dateStr}`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
      }
      const results = await Promise.allSettled(calls);
      const failed = results.filter(r => r.status === 'rejected');
      // Refresh both views even on partial failure so the UI reflects what landed.
      await Promise.all([fetchAttendanceData(), fetchSalaryData()]);
      if (failed.length === 0) {
        toast.success(`Auto-calculated ${endDay} day${endDay === 1 ? '' : 's'} from completed bookings`);
      } else if (failed.length < results.length) {
        toast.warning(`Calculated ${results.length - failed.length}/${results.length} days. ${failed.length} failed.`);
      } else {
        const detail = failed[0]?.reason?.response?.data?.detail || 'Failed to calculate attendance';
        toast.error(typeof detail === 'string' ? detail : 'Failed to calculate attendance');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to calculate attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideAttendance = (dateStr) => {
    // Open the unified edit dialog for this date
    if (!dateStr) return;
    setEditDialog({ open: true, dateStr });
  };

  const handleMarkAllPresent = async () => {
    if (loading || bulkLoading) return;
    if (!window.confirm(`Mark ${barberName || 'this barber'} as PRESENT for every eligible past day in ${monthName}? Days outside the joining/last-working-day window or marked on leave will be skipped.`)) {
      return;
    }
    setBulkLoading(true);
    try {
      // Iterate through all days up to today/end-of-month, calling the endpoint per-barber.
      // The mark-all-present endpoint operates per-date for the WHOLE salon — but here we want only THIS barber.
      // So we use the single override endpoint (with per-day eligibility validated server-side).
      const endDay = currentMonth === todayStr.slice(0, 7) ? today.getDate() : daysInMonth;
      let marked = 0, skipped = 0;
      for (let day = 1; day <= endDay; day++) {
        const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
        // Skip if day is outside joining/last-working-day or is a leave day
        if (leaveInfo.doj && dateStr < leaveInfo.doj) { skipped++; continue; }
        if (leaveInfo.last_working_date && dateStr > leaveInfo.last_working_date) { skipped++; continue; }
        if ((leaveInfo.leave_dates || []).includes(dateStr)) { skipped++; continue; }
        try {
          await axios.put(
            `${API}/salons/${salonId}/staff-attendance/override/${barberId}/${dateStr}`,
            { status: 'present', note: 'Bulk mark all present' },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          marked++;
        } catch (innerErr) {
          skipped++;
        }
      }
      toast.success(`Marked ${marked} day(s) as present${skipped ? ` (skipped ${skipped})` : ''}`);
      fetchAttendanceData();
      fetchSalaryData();
    } catch (error) {
      toast.error('Failed to mark all present');
    } finally {
      setBulkLoading(false);
    }
  };

  const handlePaySalary = async () => {
    try {
      await axios.post(
        `${API}/salons/${salonId}/staff-salary/pay/${barberId}/${currentMonth}`,
        { payment_method: paymentMethod, note: paymentNote },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Salary marked as paid and financial transaction created');
      setShowPayDialog(false);
      setEarlyPayConfirm(false);
      setPaymentNote('');
      fetchSalaryData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process payment');
    }
  };

  // Item 3a — confirm before marking salary paid pre-month-end
  const handleMarkPaidClick = () => {
    const now = new Date();
    const [y, m] = currentMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate(); // day-0 of next month = last day of current
    const isBeforeMonthEnd =
      now.getFullYear() === y && (now.getMonth() + 1) === m && now.getDate() < lastDay;
    if (isBeforeMonthEnd) {
      setEarlyPayConfirm(true);
    } else {
      setShowPayDialog(true);
    }
  };

  const getAttendanceForDate = (day) => {
    const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
    return attendance.find(a => a.date === dateStr);
  };

  const navigateMonth = (direction) => {
    const [y, m] = currentMonth.split('-').map(Number);
    let newMonth = m + direction;
    let newYear = y;
    
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    
    setCurrentMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const days = [];
    // Empty cells for days before the first of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push({ type: 'empty', key: `empty-${i}` });
    }
    // Actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
      const isFuture = dateStr > todayStr;
      const record = getAttendanceForDate(day);
      days.push({
        type: 'day',
        day,
        dateStr,
        isFuture,
        record,
        key: `day-${day}`
      });
    }
    return days;
  }, [currentMonth, daysInMonth, firstDayOfMonth, attendance, todayStr]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Module 2 — Leave balance card */}
      <LeaveBalanceCard
        salonId={salonId}
        barberId={barberId}
        barberName={barberName}
      />

      {/* Attendance Calendar */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gold" />
            Attendance - {barberName}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleMarkAllPresent}
              disabled={loading || bulkLoading}
              variant="outline"
              size="sm"
              title="Bulk mark every eligible day this month as present"
            >
              {bulkLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Mark All Present
            </Button>
            <Button
              onClick={handleCalculateAttendance}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Auto Calculate
            </Button>
          </div>
        </div>

        {/* Employment dates info row */}
        {(leaveInfo.doj || leaveInfo.last_working_date) && (
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            {leaveInfo.doj && (
              <span className="px-2 py-1 rounded-full bg-muted text-foreground">
                Joined: <strong>{leaveInfo.doj}</strong>
              </span>
            )}
            {leaveInfo.last_working_date && (
              <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-600">
                Last working day: <strong>{leaveInfo.last_working_date}</strong>
              </span>
            )}
          </div>
        )}

        {/* Month Navigator */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigateMonth(-1)} data-testid="attendance-prev-month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h4 className="font-semibold text-lg" data-testid="attendance-month-label">{monthName}</h4>
          <Button variant="ghost" size="sm" onClick={() => navigateMonth(1)} data-testid="attendance-next-month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded bg-green-500 flex items-center justify-center text-white font-bold">P</div>
            <span>Present</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded bg-yellow-500 flex items-center justify-center text-black font-bold">H</div>
            <span>Half Day</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded bg-red-500 flex items-center justify-center text-white font-bold">A</div>
            <span>Absent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded bg-purple-500 flex items-center justify-center text-white">🎉</div>
            <span>Holiday</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center text-white font-bold">L</div>
            <span>On Leave</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
              {day}
            </div>
          ))}
          
          {calendarDays.map((item) => {
            if (item.type === 'empty') {
              return <div key={item.key} className="h-10" />;
            }
            
            const { day, dateStr, isFuture, record } = item;
            const leaveRec = leaveRecords.find(
              (r) => r.date === dateStr && r.status === 'active'
            );
            const isOnLeaveDate = !!leaveRec || (leaveInfo.leave_dates || []).includes(dateStr);
            const beforeJoin = !!leaveInfo.doj && dateStr < leaveInfo.doj;
            const afterLast = !!leaveInfo.last_working_date && dateStr > leaveInfo.last_working_date;
            const outOfWindow = beforeJoin || afterLast;

            // Decide visual status: leave overrides record status
            const status = isOnLeaveDate
              ? 'on_leave'
              : (record?.status || (isFuture ? 'future' : null));

            // Any date inside employment window is clickable (incl. future for leave)
            const canClick = !outOfWindow;
            const handleClick = () => {
              if (!canClick) return;
              handleOverrideAttendance(dateStr);
            };

            const titleText = outOfWindow
              ? (beforeJoin ? `Before joining (${leaveInfo.doj})` : `After last working day (${leaveInfo.last_working_date})`)
              : leaveRec
                ? `On Leave (${leaveRec.leave_type_code}${leaveRec.half_day ? ' · half' : ''}) — click to edit`
                : isOnLeaveDate
                  ? `On Leave (legacy) — click to edit`
                  : record?.computed_under_mode === 'geo_checkin'
                    ? [
                        `Mode: Geo check-in`,
                        record?.check_in_at ? `In: ${new Date(record.check_in_at).toLocaleTimeString()}` : null,
                        record?.check_out_at ? `Out: ${new Date(record.check_out_at).toLocaleTimeString()}` : null,
                        record?.total_minutes ? `Worked: ${Math.floor(record.total_minutes / 60)}h ${record.total_minutes % 60}m` : null,
                        record?.half_day_reason ? `Reason: ${record.half_day_reason}` : null,
                        'Click to edit',
                      ].filter(Boolean).join(' · ')
                    : `Click to edit (${status || 'not marked'})`;
            
            return (
              <button
                key={item.key}
                type="button"
                disabled={!canClick}
                onClick={handleClick}
                data-testid={`attn-cell-${dateStr}`}
                className={`h-10 rounded text-xs font-bold transition-all ${
                  outOfWindow
                    ? 'bg-muted/20 text-muted-foreground cursor-not-allowed opacity-40'
                    : status
                    ? STATUS_COLORS[status]
                    : 'bg-muted/50 hover:bg-muted cursor-pointer'
                } ${record?.auto_calculated === false || isOnLeaveDate ? 'ring-2 ring-gold' : ''}`}
                title={titleText}
              >
                <div className="flex flex-col items-center">
                  <span className={isFuture ? '' : 'text-[10px] opacity-70'}>{day}</span>
                  {status && status !== 'future' && (
                    <span className="text-[10px]">
                      {status === 'on_leave' && leaveRec?.leave_type_code
                        ? leaveRec.leave_type_code
                        : STATUS_LABELS[status]}
                    </span>
                  )}
                  {record?.computed_under_mode === 'geo_checkin' && (record?.total_minutes ?? 0) > 0 && (
                    <span className="text-[8px] opacity-80" data-testid={`attn-duration-${dateStr}`}>
                      {Math.floor(record.total_minutes / 60)}h{record.total_minutes % 60 ? `${record.total_minutes % 60}m` : ''}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          💡 Click any date inside the employment window to open the edit dialog —
          set check-in / check-out times, mark Present / Half-day / Absent / Holiday,
          or record leave with type (CL / SL / PL / UL).
        </p>
      </div>

      {/* Salary Summary */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-gold" />
            Salary Summary - {monthName}
          </h3>
          {salary && !salary.is_paid && (
            <Button
              onClick={handleMarkPaidClick}
              className="bg-gold text-black hover:bg-gold/90"
              data-testid="mark-salary-paid-btn"
            >
              <Banknote className="w-4 h-4 mr-2" />
              Mark as Paid
            </Button>
          )}
          {salary?.is_paid && (
            <span className="px-3 py-1 bg-green-500/10 text-green-600 rounded-full text-sm font-semibold flex items-center gap-1">
              <Check className="w-4 h-4" /> Paid
            </span>
          )}
        </div>

        {/* Item 3d — non-blocking inline notice when compensation is missing */}
        {!(compensation > 0) && (
          <div
            className="mb-4 text-xs px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 inline-flex items-center gap-2"
            data-testid="compensation-missing-chip"
          >
            <DollarSign className="w-3.5 h-3.5" strokeWidth={1.8} />
            Set monthly compensation in Staff settings to calculate salary. Attendance can still be marked.
          </div>
        )}

        {salary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Base Salary</p>
              <p className="text-xl font-bold text-foreground">₹{salary.base_salary}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Working Days</p>
              <p className="text-xl font-bold text-foreground">{salary.working_days}</p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-4">
              <p className="text-xs text-green-600">Present Days</p>
              <p className="text-xl font-bold text-green-600">{salary.present_days}</p>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-4">
              <p className="text-xs text-yellow-600">Half Days</p>
              <p className="text-xl font-bold text-yellow-600">{salary.half_days}</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-4">
              <p className="text-xs text-red-600">Absent Days</p>
              <p className="text-xl font-bold text-red-600">{salary.absent_days}</p>
            </div>
            <div className="bg-purple-500/10 rounded-lg p-4">
              <p className="text-xs text-purple-600">Holidays</p>
              <p className="text-xl font-bold text-purple-600">{salary.holidays}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Calculated Salary</p>
              <p className="text-xl font-bold text-foreground">₹{salary.calculated_salary}</p>
            </div>
            <div className="bg-gold/10 rounded-lg p-4">
              <p className="text-xs text-gold">Incentive</p>
              <p className="text-xl font-bold text-gold">₹{salary.incentive_amount || 0}</p>
            </div>

            {/* Module 4 — Leave breakdown + LOP deduction */}
            {(salary.leave_breakdown && Object.keys(salary.leave_breakdown).length > 0) || (salary.lop_deduction > 0) ? (
              <div className="col-span-2 md:col-span-4 bg-card border border-border rounded-lg p-4" data-testid="salary-leave-breakdown">
                <p className="text-sm font-semibold text-foreground mb-2">Leave Breakdown</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {Object.entries(salary.leave_breakdown || {}).map(([code, days]) => (
                    <span key={code} className="px-2 py-1 rounded bg-muted text-foreground">
                      <strong>{code}</strong>: {days} {days === 1 ? 'day' : 'days'}
                    </span>
                  ))}
                  <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-700">
                    Paid leaves: {salary.paid_leave_days || 0}
                  </span>
                  <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-700">
                    Unpaid leaves: {salary.unpaid_leave_days || 0}
                  </span>
                </div>
                {salary.lop_deduction > 0 && salary.working_days_in_month > 0 && (
                  <p className="text-sm mt-3 text-rose-700" data-testid="salary-lop-line">
                    <strong>LOP deduction</strong>: {salary.unpaid_leave_days} {salary.unpaid_leave_days === 1 ? 'day' : 'days'} × ₹
                    {Math.round((salary.base_compensation || salary.base_salary || 0) / salary.working_days_in_month)}/day
                    {' '}= <strong>−₹{Math.round(salary.lop_deduction)}</strong>
                  </p>
                )}
              </div>
            ) : null}

            <div className="bg-card border-2 border-gold rounded-lg p-4 col-span-2 md:col-span-4">
              <p className="text-sm text-gold font-semibold">Total Payable</p>
              <p className="text-3xl font-bold text-gold" data-testid="salary-final-payable">
                ₹{salary.final_payable ?? salary.total_payable}
              </p>
              {salary.attendance_mode_snapshot && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Computed under mode: {salary.attendance_mode_snapshot === 'geo_checkin' ? 'Geo check-in' : 'Service completion'}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>No salary data yet. Click "Auto Calculate" to generate attendance.</p>
          </div>
        )}

        {salary?.is_paid && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-sm text-green-600">
              <Check className="w-4 h-4 inline mr-1" />
              Paid on {new Date(salary.paid_at).toLocaleDateString()} via {salary.payment_method?.toUpperCase()}
            </p>
          </div>
        )}
      </div>

      {/* Item 3a — Pre-month-end confirm dialog */}
      <Dialog open={earlyPayConfirm} onOpenChange={setEarlyPayConfirm}>
        <DialogContent data-testid="early-pay-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Pay salary before month-end?</DialogTitle>
          </DialogHeader>
          <div className="py-3 text-sm text-muted-foreground space-y-2">
            <p>
              This month isn&apos;t over yet. Do you want to mark <strong className="text-foreground">{barberName}&apos;s</strong> salary as paid for <strong className="text-foreground">{monthName}</strong>?
            </p>
            <p className="text-xs">
              The current amount is based on attendance recorded so far. Any additional days worked this month will not auto-adjust.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEarlyPayConfirm(false)} data-testid="early-pay-confirm-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => { setEarlyPayConfirm(false); setShowPayDialog(true); }}
              className="bg-gold text-black hover:bg-gold/90"
              data-testid="early-pay-confirm-proceed"
            >
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Salary as Paid</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Amount to Pay</p>
              <p className="text-2xl font-bold text-gold">₹{salary?.final_payable ?? salary?.total_payable ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">
                To: {barberName} | Month: {monthName}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Cash', icon: Banknote },
                  { id: 'upi', label: 'UPI', icon: CreditCard },
                  { id: 'bank', label: 'Bank', icon: Building }
                ].map(method => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id)}
                    className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                      paymentMethod === method.id
                        ? 'border-gold bg-gold/10'
                        : 'border-border hover:border-gold/40'
                    }`}
                  >
                    <method.icon className={`w-5 h-5 ${paymentMethod === method.id ? 'text-gold' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note (Optional)</Label>
              <Input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Add payment note..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(false)}>Cancel</Button>
            <Button onClick={handlePaySalary} className="bg-gold text-black hover:bg-gold/90">
              <Check className="w-4 h-4 mr-2" />
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified per-cell attendance editor */}
      <AttendanceCellDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((d) => ({ ...d, open }))}
        salonId={salonId}
        barberId={barberId}
        barberName={barberName}
        dateStr={editDialog.dateStr}
        attendanceRecord={attendance.find((a) => a.date === editDialog.dateStr) || null}
        leaveRecord={leaveRecords.find((r) => r.date === editDialog.dateStr && r.status === 'active') || null}
        token={token}
        checkInMode={isCheckInMode(attMode)}
        onSaved={() => {
          fetchAttendanceData();
          fetchSalaryData();
          fetchLeaveInfo();
          fetchLeaveRecords();
        }}
      />
    </motion.div>
  );
}
