import { useState, useEffect, useRef } from 'react';
import { adminApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Badge } from '../../components/ui';
import { useDialog } from '../../context/DialogContext';
import { formatDate } from '../../lib/utils';
import { 
  UploadCloud, Mail, CheckCircle, AlertTriangle, XCircle, Search, 
  RotateCcw, Download, Send, Users, Shield, ArrowRight, FileText, Check, AlertCircle, RefreshCw 
} from 'lucide-react';

export default function ParticipantsPage() {
  const { showAlert, showConfirm } = useDialog();

  // State
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [participants, setParticipants] = useState([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [deliveryBreakdown, setDeliveryBreakdown] = useState({ not_sent: 0, pending: 0, sent: 0, failed: 0 });
  const [emailConfig, setEmailConfig] = useState({ configured: false, fromEmail: '', hasApiKey: false });
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  // Filter & Search
  const [search, setSearch] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState('');

  // CSV Import State
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvParsedRows, setCsvParsedRows] = useState([]);
  const [columnMapping, setColumnMapping] = useState({ studentId: '', fullName: '', email: '' });
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creatingAccounts, setCreatingAccounts] = useState(false);

  // Active Pending Batch for sending credentials
  const [activeBatch, setActiveBatch] = useState(null);
  const [sendingCredentials, setSendingCredentials] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);

  const fileInputRef = useRef(null);

  // Load initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const [eventsRes, configRes] = await Promise.all([
        adminApi.getEvents(),
        adminApi.getEmailConfig()
      ]);
      setEvents(eventsRes.data.events || []);
      if (eventsRes.data.events?.length && !selectedEventId) {
        setSelectedEventId(eventsRes.data.events[0]._id);
      }
      setEmailConfig(configRes.data || {});
    } catch (err) {
      console.error('Error loading events / email config:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadParticipants = async () => {
    try {
      setTableLoading(true);
      const res = await adminApi.getParticipants({
        eventId: selectedEventId || undefined,
        search: search || undefined,
        deliveryStatus: deliveryFilter || undefined
      });
      setParticipants(res.data.participants || []);
      setTotalParticipants(res.data.total || 0);
      setDeliveryBreakdown(res.data.deliveryBreakdown || { not_sent: 0, pending: 0, sent: 0, failed: 0 });
    } catch (err) {
      console.error('Error loading participants:', err);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadParticipants();
  }, [selectedEventId, deliveryFilter]);

  // Robust CSV Parser (supports quoted fields with commas and newlines)
  const parseCSV = (text) => {
    const lines = [];
    let row = [];
    let insideQuotes = false;
    let entry = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          entry += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        row.push(entry.trim());
        entry = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(entry.trim());
        if (row.some(cell => cell.length > 0)) {
          lines.push(row);
        }
        row = [];
        entry = '';
      } else {
        entry += char;
      }
    }

    if (entry.length > 0 || row.length > 0) {
      row.push(entry.trim());
      if (row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
    }

    return lines;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setPreviewData(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') return;

      const rows = parseCSV(content);
      if (rows.length < 2) {
        showAlert('Invalid CSV', 'The CSV file must contain a header row and at least one participant row.', 'destructive');
        return;
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);

      setCsvHeaders(headers);
      setCsvParsedRows(dataRows);

      // Auto-detect columns intelligently
      const mapping = { studentId: '', fullName: '', email: '' };
      headers.forEach((h) => {
        const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (lower.includes('roll') || lower.includes('prn') || lower.includes('student') || lower.includes('id') || lower === 'username') {
          if (!mapping.studentId) mapping.studentId = h;
        } else if (lower.includes('name') || lower.includes('full')) {
          if (!mapping.fullName) mapping.fullName = h;
        } else if (lower.includes('mail')) {
          if (!mapping.email) mapping.email = h;
        }
      });

      setColumnMapping(mapping);
    };
    reader.readAsText(file);
  };

  const handleGeneratePreview = async () => {
    if (!columnMapping.studentId || !columnMapping.email) {
      showAlert('Mapping Required', 'Please map at least the Student ID and Email columns.', 'destructive');
      return;
    }

    const idIndex = csvHeaders.indexOf(columnMapping.studentId);
    const nameIndex = csvHeaders.indexOf(columnMapping.fullName);
    const emailIndex = csvHeaders.indexOf(columnMapping.email);

    const payloadRows = csvParsedRows.map(row => ({
      studentId: row[idIndex] || '',
      fullName: nameIndex >= 0 ? (row[nameIndex] || '') : '',
      email: row[emailIndex] || ''
    }));

    try {
      setPreviewLoading(true);
      const res = await adminApi.previewParticipants(payloadRows, selectedEventId);
      setPreviewData(res.data);
    } catch (err) {
      showAlert('Preview Failed', err.response?.data?.message || 'Failed to validate CSV rows', 'destructive');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmAccountCreation = async () => {
    if (!previewData || !previewData.rows) return;

    const validRows = previewData.rows.filter(r => r.isValid);
    if (validRows.length === 0) {
      showAlert('No Valid Rows', 'There are no valid new participant accounts to create.', 'destructive');
      return;
    }

    showConfirm({
      title: 'Confirm Account Creation',
      message: `Create ${validRows.length} new participant account(s)? Secure temporary passwords will be generated and hashed immediately.`,
      confirmText: 'Create Accounts',
      variant: 'default',
      onConfirm: async () => {
        try {
          setCreatingAccounts(true);
          const res = await adminApi.createParticipants(
            validRows.map(r => ({
              studentId: r.studentId,
              fullName: r.fullName,
              email: r.email
            })),
            selectedEventId
          );

          showAlert('Success', `Successfully created ${res.data.summary.createdCount} participant accounts!`, 'success');

          if (res.data.batchId && res.data.createdUsers?.length > 0) {
            setActiveBatch({
              batchId: res.data.batchId,
              count: res.data.createdUsers.length
            });
          }

          // Reset import UI and reload table
          setPreviewData(null);
          setCsvFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          loadParticipants();
        } catch (err) {
          showAlert('Creation Failed', err.response?.data?.message || 'Failed to create accounts', 'destructive');
        } finally {
          setCreatingAccounts(false);
        }
      }
    });
  };

  const handleSendCredentials = async () => {
    if (!activeBatch) return;

    if (!emailConfig.configured) {
      showAlert('Email Not Configured', 'Resend API key or sender email is missing. Set RESEND_API_KEY and EMAIL_FROM on Render.', 'destructive');
      return;
    }

    showConfirm({
      title: 'Send Credential Emails',
      message: `Send individual credential emails to ${activeBatch.count} newly registered participant(s)?`,
      confirmText: 'Dispatch Emails',
      variant: 'default',
      onConfirm: async () => {
        try {
          setSendingCredentials(true);
          const res = await adminApi.sendCredentials(activeBatch.batchId, window.location.origin);
          showAlert('Batch Complete', res.data.message, 'success');
          setActiveBatch(null);
          loadParticipants();
        } catch (err) {
          showAlert('Delivery Error', err.response?.data?.message || 'Failed to dispatch emails', 'destructive');
        } finally {
          setSendingCredentials(false);
        }
      }
    });
  };

  const handleSendTestEmail = async () => {
    const testEmail = window.prompt('Enter recipient email for test:', emailConfig.fromEmail || '');
    if (!testEmail || !testEmail.trim()) return;

    try {
      setSendingTest(true);
      const res = await adminApi.sendTestEmail(testEmail.trim());
      showAlert('Test Email Sent', res.data.message, 'success');
    } catch (err) {
      showAlert('Test Failed', err.response?.data?.message || 'Could not send test email', 'destructive');
    } finally {
      setSendingTest(false);
    }
  };

  const handleRetryFailed = async () => {
    const failedUsers = participants.filter(p => p.emailDelivery?.status === 'failed');
    if (failedUsers.length === 0) {
      showAlert('No Failed Emails', 'No failed deliveries found in current list.', 'default');
      return;
    }

    showConfirm({
      title: 'Retry Failed Deliveries',
      message: `Regenerate secure temporary credentials and retry email delivery for ${failedUsers.length} participant(s)?`,
      confirmText: 'Retry Sending',
      variant: 'default',
      onConfirm: async () => {
        try {
          setRetryingFailed(true);
          const userIds = failedUsers.map(p => p._id);
          const currentEvent = events.find(e => e._id === selectedEventId);
          const res = await adminApi.retryCredentials(userIds, window.location.origin, currentEvent?.name);
          showAlert('Retry Complete', res.data.message, 'success');
          loadParticipants();
        } catch (err) {
          showAlert('Retry Failed', err.response?.data?.message || 'Could not retry deliveries', 'destructive');
        } finally {
          setRetryingFailed(false);
        }
      }
    });
  };

  const handleExportCSV = () => {
    const url = adminApi.exportParticipantsUrl(selectedEventId);
    window.open(url, '_blank');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-mono font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Bulk Participants & Credentials
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Import registrations from Google Forms, auto-generate temporary credentials, and dispatch transactional emails via Resend.
          </p>
        </div>

        {/* Global Event Selector & Email Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="bg-card border border-border/60 rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Events</option>
            {events.map((e) => (
              <option key={e._id} value={e._id}>
                {e.name} (PIN: {e.gamePin})
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTestEmail}
            loading={sendingTest}
            title={emailConfig.configured ? `Configured sender: ${emailConfig.fromEmail}` : 'Provider not configured'}
          >
            <Mail className="w-4 h-4 mr-2" />
            Test Email Config
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Provider Status Alert */}
      {!emailConfig.configured && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-400 shrink-0" />
          <div className="text-sm">
            <strong>Resend Transactional Email Not Configured:</strong> The backend requires <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> in environment variables to dispatch emails. You can still import participants and create accounts.
          </div>
        </div>
      )}

      {/* Active Ready-to-send Batch Banner */}
      {activeBatch && (
        <Card className="border-primary/40 bg-primary/10">
          <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl text-primary">
                <Send className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Credentials Ready for Dispatch</h3>
                <p className="text-sm text-muted-foreground">
                  <strong>{activeBatch.count}</strong> newly created participant account(s) have pending credentials.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveBatch(null)}
              >
                Dismiss Batch
              </Button>
              <Button
                size="sm"
                onClick={handleSendCredentials}
                loading={sendingCredentials}
                disabled={!emailConfig.configured}
              >
                <Mail className="w-4 h-4 mr-2" />
                Dispatch Credentials Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Upload & Map CSV */}
      <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Import Google Forms CSV
          </CardTitle>
          <CardDescription>
            Upload the spreadsheet export from your registration Google Form. Map the respective columns for student ID, name, and email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleFileUpload}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 text-sm text-muted-foreground cursor-pointer"
            />
            {csvFile && (
              <span className="text-xs font-mono text-muted-foreground">
                Loaded: {csvFile.name} ({csvParsedRows.length} rows detected)
              </span>
            )}
          </div>

          {/* Column Mapping Section */}
          {csvHeaders.length > 0 && (
            <div className="p-4 rounded-xl border border-border/50 bg-background/50 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Column Mapping
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Student ID (Unique Username) *
                  </label>
                  <select
                    value={columnMapping.studentId}
                    onChange={(e) => setColumnMapping({ ...columnMapping, studentId: e.target.value })}
                    className="w-full bg-card border border-border/60 rounded-lg p-2 text-sm text-foreground font-mono"
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Full Name (Optional)
                  </label>
                  <select
                    value={columnMapping.fullName}
                    onChange={(e) => setColumnMapping({ ...columnMapping, fullName: e.target.value })}
                    className="w-full bg-card border border-border/60 rounded-lg p-2 text-sm text-foreground font-mono"
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Email Address *
                  </label>
                  <select
                    value={columnMapping.email}
                    onChange={(e) => setColumnMapping({ ...columnMapping, email: e.target.value })}
                    className="w-full bg-card border border-border/60 rounded-lg p-2 text-sm text-foreground font-mono"
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleGeneratePreview}
                  loading={previewLoading}
                  disabled={!columnMapping.studentId || !columnMapping.email}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Validate & Preview Rows
                </Button>
              </div>
            </div>
          )}

          {/* Validation & Preview Summary */}
          {previewData && (
            <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg border border-border/50 bg-background/50">
                  <div className="text-xs text-muted-foreground">Total Rows</div>
                  <div className="text-2xl font-mono font-bold text-foreground">
                    {previewData.summary.totalRows}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                  <div className="text-xs text-emerald-400">Valid New Accounts</div>
                  <div className="text-2xl font-mono font-bold text-emerald-400">
                    {previewData.summary.validCount}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/10">
                  <div className="text-xs text-amber-400">Duplicates / Existing</div>
                  <div className="text-2xl font-mono font-bold text-amber-400">
                    {previewData.summary.duplicateInCsvCount + previewData.summary.existingAccountCount}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/10">
                  <div className="text-xs text-rose-400">Invalid Rows</div>
                  <div className="text-2xl font-mono font-bold text-rose-400">
                    {previewData.summary.invalidCount}
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-border/60 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs font-semibold uppercase text-muted-foreground sticky top-0 backdrop-blur-md">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Student ID</th>
                      <th className="p-3">Full Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Status / Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {previewData.rows.slice(0, 150).map((r, i) => (
                      <tr key={i} className={r.isValid ? 'hover:bg-muted/20' : 'bg-destructive/5'}>
                        <td className="p-3 text-xs font-mono text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-mono font-semibold text-foreground">{r.studentId || '—'}</td>
                        <td className="p-3 text-muted-foreground">{r.fullName || '—'}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{r.email || '—'}</td>
                        <td className="p-3">
                          {r.isValid ? (
                            <span className="inline-flex items-center text-xs text-emerald-400 font-medium">
                              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-xs text-rose-400 font-medium" title={r.errors.join(', ')}>
                              <XCircle className="w-3.5 h-3.5 mr-1 shrink-0" /> {r.errors.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setPreviewData(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmAccountCreation}
                  loading={creatingAccounts}
                  disabled={previewData.summary.validCount === 0}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Confirm & Create {previewData.summary.validCount} Accounts
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Participants Directory & Delivery Statuses */}
      <Card className="border-border/60 bg-card/70 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Participant Accounts & Delivery Status
              </CardTitle>
              <CardDescription>
                Live database records showing account status and transactional email delivery states.
              </CardDescription>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadParticipants}
                loading={tableLoading}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
              {deliveryBreakdown.failed > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRetryFailed}
                  loading={retryingFailed}
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Retry Failed ({deliveryBreakdown.failed})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Breakdown Pills */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            <button
              onClick={() => setDeliveryFilter('')}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${deliveryFilter === '' ? 'border-primary bg-primary/20 text-primary' : 'border-border/60 bg-muted/30 text-muted-foreground'}`}
            >
              All ({totalParticipants})
            </button>
            <button
              onClick={() => setDeliveryFilter('sent')}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${deliveryFilter === 'sent' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' : 'border-border/60 bg-muted/30 text-muted-foreground'}`}
            >
              Sent ({deliveryBreakdown.sent})
            </button>
            <button
              onClick={() => setDeliveryFilter('not_sent')}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${deliveryFilter === 'not_sent' ? 'border-amber-500 bg-amber-500/20 text-amber-400' : 'border-border/60 bg-muted/30 text-muted-foreground'}`}
            >
              Not Sent ({deliveryBreakdown.not_sent})
            </button>
            <button
              onClick={() => setDeliveryFilter('pending')}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${deliveryFilter === 'pending' ? 'border-sky-500 bg-sky-500/20 text-sky-400' : 'border-border/60 bg-muted/30 text-muted-foreground'}`}
            >
              Pending ({deliveryBreakdown.pending})
            </button>
            <button
              onClick={() => setDeliveryFilter('failed')}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${deliveryFilter === 'failed' ? 'border-rose-500 bg-rose-500/20 text-rose-400' : 'border-border/60 bg-muted/30 text-muted-foreground'}`}
            >
              Failed ({deliveryBreakdown.failed})
            </button>
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by student ID, full name, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadParticipants()}
                className="pl-9 bg-background/50 border-border/60 font-mono text-sm"
              />
            </div>
            <Button size="sm" onClick={loadParticipants}>Search</Button>
          </div>

          {/* Main Participants Table */}
          <div className="border border-border/60 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Student ID</th>
                  <th className="p-3">Full Name</th>
                  <th className="p-3">Email Address</th>
                  <th className="p-3">Event</th>
                  <th className="p-3">Account Status</th>
                  <th className="p-3">Email Delivery</th>
                  <th className="p-3">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-muted-foreground">
                      No participants match current filters.
                    </td>
                  </tr>
                ) : (
                  participants.map((p) => (
                    <tr key={p._id} className="hover:bg-muted/20">
                      <td className="p-3 font-mono font-semibold text-primary">{p.username}</td>
                      <td className="p-3 text-foreground font-medium">{p.fullName || '—'}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{p.email || '—'}</td>
                      <td className="p-3 text-xs text-muted-foreground">{p.eventId?.name || 'Unassigned'}</td>
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-medium ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {p.emailDelivery?.status === 'sent' && (
                          <span className="inline-flex items-center text-xs text-emerald-400 font-mono">
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Sent
                          </span>
                        )}
                        {p.emailDelivery?.status === 'pending' && (
                          <span className="inline-flex items-center text-xs text-sky-400 font-mono animate-pulse">
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Pending
                          </span>
                        )}
                        {p.emailDelivery?.status === 'failed' && (
                          <span className="inline-flex items-center text-xs text-rose-400 font-mono" title={p.emailDelivery?.error}>
                            <AlertCircle className="w-3.5 h-3.5 mr-1" /> Failed
                          </span>
                        )}
                        {(!p.emailDelivery?.status || p.emailDelivery?.status === 'not_sent') && (
                          <span className="inline-flex items-center text-xs text-muted-foreground font-mono">
                            Not Sent
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {formatDate(p.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
