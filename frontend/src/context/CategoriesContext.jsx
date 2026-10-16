import { createContext, useContext, useState, useEffect } from 'react';
import { categoriesApi } from '../lib/api';
import { useSession } from './SessionContext';

const CategoriesContext = createContext(null);

// Generate a stable color from category name using hash
function generateColorFromName(name) {
  const hash = name.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  const hue = Math.abs(hash) % 360;
  const saturation = 70 + (Math.abs(hash) % 20);
  const lightness = 50;
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Predefined color palette for better visual consistency
const COLOR_PALETTE = [
  '#22d3ee', '#38bdf8', '#60a5fa', '#3b82f6', '#818cf8',
  '#67e8f9', '#93c5fd', '#0ea5e9', '#a5f3fc', '#2563eb'
];

function getCategoryColor(categoryName, categoryObject) {
  // If category has a color from database, use it
  if (categoryObject?.color) {
    return categoryObject.color;
  }
  
  // Otherwise generate from palette or hash
  const hash = categoryName.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

export function CategoriesProvider({ children }) {
  const { event } = useSession();
  const [categories, setCategories] = useState([]);
  const [categoriesByName, setCategoriesByName] = useState({}); // Map for quick lookup
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  // Fetch categories when event changes
  useEffect(() => {
    if (!event?._id) {
      setCategories([]);
      setCategoriesByName({});
      return;
    }

    const fetchCategories = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await categoriesApi.get(event._id);
        
        if (response.data?.categories) {
          const categoryList = response.data.categories;
          setCategories(categoryList);
          
          // Build lookup map for O(1) access
          const lookup = {};
          categoryList.forEach(cat => {
            lookup[cat.name] = cat;
          });
          setCategoriesByName(lookup);
          setLastFetch(Date.now());
        } else {
          setCategories([]);
          setCategoriesByName({});
        }
      } catch (err) {
        console.error('[CategoriesContext] Error fetching categories:', err);
        setError(err.message || 'Failed to load categories');
        setCategories([]);
        setCategoriesByName({});
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [event?._id]);

  // Refresh categories
  const refreshCategories = async () => {
    if (!event?._id) return;
    
    try {
      setError(null);
      const response = await categoriesApi.get(event._id);
      if (response.data?.categories) {
        const categoryList = response.data.categories;
        setCategories(categoryList);
        const lookup = {};
        categoryList.forEach(cat => {
          lookup[cat.name] = cat;
        });
        setCategoriesByName(lookup);
        setLastFetch(Date.now());
      }
    } catch (err) {
      console.error('[CategoriesContext] Error refreshing categories:', err);
      setError(err.message);
    }
  };

  const getCategoryByName = (name) => categoriesByName[name];

  const getColorForCategory = (categoryName) => {
    const categoryObj = categoriesByName[categoryName];
    return getCategoryColor(categoryName, categoryObj);
  };

  const value = {
    categories,
    loading,
    error,
    getCategoryByName,
    getColorForCategory,
    refreshCategories,
    lastFetch
  };

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
}
