import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '../../components/ui';
import { Plus, Edit, Trash2, X } from 'lucide-react';
import { useDialog } from '../../context/DialogContext';

const COLOR_PRESETS = [
  '#22d3ee', '#38bdf8', '#60a5fa', '#3b82f6',
  '#818cf8', '#67e8f9', '#93c5fd', '#0ea5e9'
];

const defaultCategory = {
  name: '',
  description: '',
  color: '#22d3ee',
  eventId: ''
};

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState(defaultCategory);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const { showAlert, showConfirm } = useDialog();

  // First load: Get events, then select first event
  useEffect(() => {
    const initializeEvents = async () => {
      try {
        const eventsRes = await adminApi.getEvents();
        setEvents(eventsRes.data.events);
        
        // Auto-select first event if none selected
        if (eventsRes.data.events.length > 0 && !selectedEvent) {
          setSelectedEvent(eventsRes.data.events[0]._id);
        }
      } catch (error) {
        console.error('Error fetching events:', error);
        showAlert('Error', 'Failed to load events', 'destructive');
      }
    };

    initializeEvents();
  }, []); // Only run on mount

  // Fetch categories when event is selected
  const fetchCategories = async (eventId) => {
    if (!eventId) {
      setCategories([]);
      return;
    }
    
    try {
      setLoading(true);
      const categoriesRes = await adminApi.getCategories(eventId);
      setCategories(categoriesRes.data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      showAlert('Error', 'Failed to load categories', 'destructive');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEvent) {
      fetchCategories(selectedEvent);
    }
  }, [selectedEvent]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({
      ...defaultCategory,
      eventId: selectedEvent
    });
    setModalError('');
    setShowModal(true);
  };

  const openEditModal = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color || '#3b82f6',
      eventId: category.eventId?._id || category.eventId
    });
    setModalError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!formData.name.trim()) {
      setModalError('Category name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await adminApi.updateCategory(editingCategory._id, formData);
      } else {
        await adminApi.createCategory(formData);
      }
      setShowModal(false);
      fetchCategories(selectedEvent);
    } catch (error) {
      console.error('Save category error:', error.response?.data || error.message);
      setModalError(error.response?.data?.message || 'Error saving category. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    showConfirm({
      title: 'Delete Category',
      message: 'Are you sure you want to permanently delete this category? This cannot be undone if challenges use it.',
      confirmText: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await adminApi.deleteCategory(id);
          fetchCategories(selectedEvent);
        } catch (error) {
          showAlert('Error', error.response?.data?.message || 'Error deleting category', 'destructive');
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-3xl font-bold text-foreground">Categories</h1>
          <p className="text-muted-foreground">{categories.length} categories</p>
        </div>
        <Button 
          onClick={openCreateModal}
          disabled={!selectedEvent || events.length === 0}
          className="shadow-[0_0_15px_rgba(var(--primary),0.2)]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Event Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-foreground">Event:</label>
        <select
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-input text-foreground"
        >
          <option value="">Select an event...</option>
          {events.map((event) => (
            <option key={event._id} value={event._id}>{event.name}</option>
          ))}
        </select>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground">
              No categories found. Create your first category!
            </p>
          </div>
        ) : (
          categories.map((category) => (
            <Card key={category._id} className="overflow-hidden">
              <div 
                className="h-1 w-full" 
                style={{ backgroundColor: category.color }}
              />
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-mono font-bold text-foreground">{category.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
                  </div>
                  <div 
                    className="w-6 h-6 rounded border-2 border-border" 
                    style={{ backgroundColor: category.color }}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditModal(category)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(category._id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm py-8">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</CardTitle>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Name */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Category Name *</label>
                  <Input
                    type="text"
                    placeholder="e.g., Web Security"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={saving}
                    className="font-mono"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Description</label>
                  <textarea
                    placeholder="Optional description for this category"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    disabled={saving}
                    rows={3}
                    className="px-3 py-2 rounded-lg border border-border bg-input text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm resize-none"
                  />
                </div>

                {/* Color Picker */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Color</label>
                  <div className="grid grid-cols-4 gap-2">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className="w-10 h-10 rounded border-2 transition-all"
                        style={{
                          backgroundColor: color,
                          borderColor: formData.color === color ? '#fff' : 'transparent',
                          boxShadow: formData.color === color ? `0 0 0 2px #000, 0 0 0 4px ${color}` : 'none'
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 p-2 rounded bg-muted">
                    <input
                      type="text"
                      placeholder="#3b82f6"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      disabled={saving}
                      className="w-full px-2 py-1 rounded border border-border bg-input text-foreground text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Error Message */}
                {modalError && (
                  <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
                    {modalError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowModal(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="flex-1"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      editingCategory ? 'Update Category' : 'Create Category'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
