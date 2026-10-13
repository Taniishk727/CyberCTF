import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '../../components/ui';
import { ArrowLeft, Plus, X, UploadCloud, Terminal, Flag, Layout } from 'lucide-react';
import { cn } from '../../lib/utils';
import axios from 'axios';
import { useDialog } from '../../context/DialogContext';

const difficulties = ['Easy', 'Medium', 'Hard'];

export default function CreateChallengePage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { showAlert } = useDialog();

  const [formData, setFormData] = useState({
    eventId: '',
    title: '',
    description: '',
    category: '',
    difficulty: 'Easy',
    points: 100,
    flagPrefix: 'pictCTF',
    flagContent: '',
    flagFormat: 'pictCTF{...}',
    hints: [],
    attachments: []
  });

  const [urlInput, setUrlInput] = useState({ name: '', url: '' });

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const eventsRes = await adminApi.getEvents();
        setEvents(eventsRes.data.events);
        if (eventsRes.data.events.length > 0) {
          setFormData(prev => ({ ...prev, eventId: eventsRes.data.events[0]._id }));
        }
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  // Fetch categories when eventId changes
  useEffect(() => {
    if (!formData.eventId) {
      setCategories([]);
      return;
    }

    const fetchCategories = async () => {
      try {
        const res = await adminApi.getCategories(formData.eventId);
        setCategories(res.data.categories || []);
        
        // Auto-select first category if available
        if (res.data.categories && res.data.categories.length > 0) {
          setFormData(prev => ({ ...prev, category: res.data.categories[0].name }));
        } else {
          setFormData(prev => ({ ...prev, category: '' }));
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        setCategories([]);
        setFormData(prev => ({ ...prev, category: '' }));
      }
    };

    fetchCategories();
  }, [formData.eventId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.description || !formData.flagContent || !formData.eventId) {
      showAlert('Required', "Please fill out all required fields.", 'warning');
      return;
    }

    setSaving(true);
    const finalFlag = `${formData.flagPrefix}{${formData.flagContent}}`;
    
    const payload = {
      ...formData,
      flag: finalFlag,
    };

    try {
      await adminApi.createChallenge(payload);
      navigate('/admin/challenges');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Error creating challenge', 'destructive');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();
    if (!cloudName || !uploadPreset || /^(your_|placeholder)/i.test(cloudName) || /^(your_|placeholder)/i.test(uploadPreset)) {
      showAlert(
        'Cloudinary Configuration Required',
        'Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to real values in the frontend deployment environment. The upload preset must allow unsigned uploads, then rebuild and redeploy the frontend.',
        'destructive'
      );
      return;
    }

    setUploading(true);
    const uploadData = new FormData();
    uploadData.append('file', file);
    uploadData.append('upload_preset', uploadPreset);
    
    try {
      const res = await axios.post(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/upload`,
        uploadData
      );
      
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, { type: 'file', name: file.name, url: res.data.secure_url }]
      }));
    } catch (error) {
      const providerMessage = error.response?.data?.error?.message || error.message;
      const isCredentialError = /invalid api key|invalid signature|upload preset/i.test(providerMessage);
      showAlert(
        'Upload Failed',
        isCredentialError
          ? `${providerMessage}. Check the Cloudinary cloud name and unsigned upload preset in the frontend deployment settings, then rebuild and redeploy the frontend.`
          : providerMessage,
        'destructive'
      );
    } finally {
      setUploading(false);
    }
  };

  const addHint = () => {
    setFormData(prev => ({
      ...prev,
      hints: [...prev.hints, { content: '', cost: 0 }]
    }));
  };

  const updateHint = (index, field, value) => {
    const newHints = [...formData.hints];
    newHints[index] = { ...newHints[index], [field]: value };
    setFormData(prev => ({ ...prev, hints: newHints }));
  };

  const removeHint = (index) => {
    setFormData(prev => ({
      ...prev,
      hints: prev.hints.filter((_, i) => i !== index)
    }));
  };

  const removeAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const addUrl = () => {
    if (!urlInput.url.trim()) {
      showAlert('Required', 'Please enter a URL', 'warning');
      return;
    }

    const urlName = urlInput.name.trim() || new URL(urlInput.url).hostname;
    
    setFormData(prev => ({
      ...prev,
      attachments: [...prev.attachments, { type: 'url', name: urlName, url: urlInput.url }]
    }));

    setUrlInput({ name: '', url: '' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/challenges">
          <Button variant="ghost" size="icon" className="hover:bg-muted text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-mono text-3xl font-bold text-foreground">Create Challenge</h1>
          <p className="text-muted-foreground">Design a new offensive security task</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        
        {/* Core Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Info Column */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card className="bg-card/40 border-border/50">
              <CardHeader className="border-b border-border/30 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layout className="w-5 h-5 text-primary" /> Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Challenge Title</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., SQL Injection 101"
                    className="font-mono border-border focus-visible:border-primary"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Description (Supports Markdown)</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Explain the challenge scenario..."
                    className="flex min-h-[200px] w-full rounded-lg border border-border bg-black/40 px-4 py-3 text-sm text-foreground font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary shadow-inner"
                    required
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/40 border-border/50">
              <CardHeader className="border-b border-border/30 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Flag className="w-5 h-5 text-primary" /> Flag Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col gap-6">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Flag Prefix</label>
                    <Input
                      value={formData.flagPrefix}
                      onChange={(e) => setFormData(prev => ({ ...prev, flagPrefix: e.target.value }))}
                      placeholder="e.g., pictCTF"
                      className="font-mono text-primary border-border"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Visible Format Hint</label>
                    <Input
                      value={formData.flagFormat}
                      onChange={(e) => setFormData(prev => ({ ...prev, flagFormat: e.target.value }))}
                      placeholder="pictCTF{...}"
                      className="font-mono border-border"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Flag Content (Inside Brackets)</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-muted-foreground">{formData.flagPrefix}{`{`}</span>
                    <Input
                      value={formData.flagContent}
                      onChange={(e) => setFormData(prev => ({ ...prev, flagContent: e.target.value }))}
                      placeholder="secret_flag_content"
                      className="font-mono text-sm bg-black text-success border-success/30 focus-visible:ring-success"
                      required
                    />
                    <span className="font-mono text-sm text-muted-foreground">{`}`}</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">Final Evaluated Flag</span>
                  <span className="font-mono text-sm text-foreground">
                    {formData.flagPrefix}{`{`}{formData.flagContent || '...'}{`}`}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Cloudinary File Uploads */}
            <Card className="bg-card/40 border-border/50">
              <CardHeader className="border-b border-border/30 pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-primary" /> Attachments
                </CardTitle>
                <div className="relative">
                  <input 
                    type="file" 
                    onChange={handleFileUpload} 
                    disabled={uploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button type="button" variant="outline" size="sm" loading={uploading}>
                    <Plus className="w-3 h-3 mr-2" /> Upload File
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col gap-4">
                {/* Add URL Section */}
                <div className="p-4 rounded-lg bg-black/40 border border-border flex flex-col gap-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Add URL (Optional)</span>
                  <div className="flex flex-col gap-2">
                    <Input
                      value={urlInput.name}
                      onChange={(e) => setUrlInput(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="URL name (optional, auto-fill from domain)"
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={urlInput.url}
                        onChange={(e) => setUrlInput(prev => ({ ...prev, url: e.target.value }))}
                        placeholder="https://example.com"
                        className="text-sm flex-1"
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={addUrl}
                        className="whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add URL
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Attachments List */}
                 {formData.attachments.length === 0 ? (
                   <p className="text-sm text-center text-muted-foreground py-4 border border-dashed border-border rounded-lg bg-black/20">
                     No attachments yet. Upload files or add URLs above.
                   </p>
                 ) : (
                   <div className="flex flex-col gap-3">
                     {formData.attachments.map((att, index) => (
                       <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
                         <div className="flex flex-col overflow-hidden max-w-[80%]">
                           <span className="text-sm font-medium font-mono text-foreground truncate">{att.name}</span>
                           <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-primary truncate hover:underline">{att.url}</a>
                         </div>
                         <Button type="button" variant="ghost" size="icon" onClick={() => removeAttachment(index)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                           <X className="w-4 h-4" />
                         </Button>
                       </div>
                     ))}
                   </div>
                 )}
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <Card className="bg-card/40 border-border/50">
              <CardHeader className="border-b border-border/30 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-primary" /> Metadata
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Target Event</label>
                  <select
                    value={formData.eventId}
                    onChange={(e) => setFormData(prev => ({ ...prev, eventId: e.target.value }))}
                    className="px-3 py-2.5 rounded-lg border border-border bg-black text-foreground text-sm font-mono"
                    required
                  >
                    <option value="" disabled>Select Event</option>
                    {events.map((event) => (
                      <option key={event._id} value={event._id}>{event.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="px-3 py-2.5 rounded-lg border border-border bg-black text-foreground text-sm font-mono"
                    required
                  >
                    {categories.length === 0 ? (
                      <option value="" disabled>No categories available</option>
                    ) : (
                      categories.map((cat) => (
                        <option key={cat._id} value={cat.name}>{cat.name}</option>
                      ))
                    )}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Difficulty</label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value }))}
                    className="px-3 py-2.5 rounded-lg border border-border bg-black text-foreground text-sm font-mono"
                  >
                    {difficulties.map((diff) => (
                      <option key={diff} value={diff}>{diff}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Point Value</label>
                  <Input
                    type="number"
                    value={formData.points}
                    onChange={(e) => setFormData(prev => ({ ...prev, points: parseInt(e.target.value) || 0 }))}
                    min="0"
                    className="font-mono text-sm text-primary font-bold bg-black"
                    required
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/40 border-border/50">
              <CardHeader className="border-b border-border/30 pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Hints</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addHint}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="pt-6">
                {formData.hints.length === 0 ? (
                   <p className="text-sm text-center text-muted-foreground">No hints added.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {formData.hints.map((hint, index) => (
                      <div key={index} className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-black/40">
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-semibold text-muted-foreground uppercase">Hint {index + 1}</span>
                           <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => removeHint(index)}>
                             <X className="w-3 h-3" />
                           </Button>
                        </div>
                        <Input
                          value={hint.content}
                          onChange={(e) => updateHint(index, 'content', e.target.value)}
                          placeholder="Hint text..."
                          className="h-8 text-sm"
                        />
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">Cost:</span>
                          <Input
                            type="number"
                            value={hint.cost}
                            onChange={(e) => updateHint(index, 'cost', parseInt(e.target.value) || 0)}
                            className="h-8 text-sm w-20 px-2"
                            min="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Button type="submit" size="lg" loading={saving} className="w-full text-base font-bold tracking-wide uppercase shadow-[0_0_20px_rgba(var(--primary),0.2)]">
              Deploy Challenge
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
