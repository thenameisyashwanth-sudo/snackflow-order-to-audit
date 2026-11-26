import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type AppLanguage = 'en' | 'ta';

const LANG_STORAGE_KEY = 'snackflow_lang';

const TRANSLATIONS: Record<string, { en: string; ta: string }> = {
  // Navigation
  'nav.owner-dashboard': { en: 'Owner Dashboard', ta: 'உரிமையாளர் முகப்பு' },
  'nav.field-order': { en: 'New Order', ta: 'புதிய ஆர்டர்' },
  'nav.my-orders': { en: 'My Orders', ta: 'என் ஆர்டர்கள்' },
  'nav.visit-log': { en: 'Visit Log', ta: 'பயணப் பதிவு' },
  'nav.order-verification': { en: 'Orders & Approval', ta: 'ஆர்டர் சரிபார்ப்பு' },
  'nav.invoices-dispatch': { en: 'GST Invoices & Dispatch', ta: 'GST பில் & அனுப்புதல்' },
  'nav.payments': { en: 'Payments & Receivables', ta: 'வசூல் & நிலுவை' },
  'nav.production-runs': { en: 'Production & BOM', ta: 'உற்பத்தி & BOM' },
  'nav.purchases': { en: 'Raw Material Receipts', ta: 'மூலப்பொருள் கொள்முதல்' },
  'nav.inventory': { en: 'Stock & Ledger', ta: 'சரக்கு & பதிவேடு' },
  'nav.bom-masters': { en: 'Products & BOM', ta: 'பொருட்கள் & BOM' },
  'nav.reports': { en: 'Audit Reports', ta: 'தணிக்கை அறிக்கைகள்' },
  'nav.catalog': { en: 'Price List', ta: 'விலை பட்டியல்' },

  // Production Floor
  'prod.title': { en: 'BOM Production Runs & Costing', ta: 'உற்பத்தி பதிவு & செலவு கணக்கீடு' },
  'prod.logRun': { en: 'Log Production Run', ta: 'உற்பத்தி பதிவு' },
  'prod.expectedYield': { en: 'Expected Yield', ta: 'எதிர்பார்க்கப்படும் உற்பத்தி' },
  'prod.actualOutput': { en: 'Actual Output', ta: 'உண்மையான உற்பத்தி' },
  'prod.wastageDamaged': { en: 'Wastage / Damaged', ta: 'சேதம் / கழிவு' },
  'prod.varianceAlert': { en: 'Variance Alert', ta: 'வேறுபாடு எச்சரிக்கை' },
  'prod.saveRun': { en: 'Save Production Run', ta: 'உற்பத்தி பதிவை சேமி' },
  'prod.cartonsUsed': { en: 'Cartons Used', ta: 'பயன்படுத்திய அட்டைப்பெட்டிகள்' },
  'prod.rawMaterialIssues': {
    en: 'Raw Material Issues (Planned vs Actual)',
    ta: 'மூலப்பொருள் வழங்கல் (திட்டம் vs உண்மை)',
  },

  // Salesman Order Entry
  'sales.deskTitle': { en: 'Field Salesman Order Desk', ta: 'கள விற்பனையாளர் ஆர்டர்' },
  'sales.placeOrder': { en: 'Place Order', ta: 'ஆர்டர் பதிவு' },
  'sales.myOrders': { en: 'My Orders', ta: 'என் ஆர்டர்கள்' },
  'sales.selectCustomer': { en: 'Step 1 · Select Customer', ta: 'படி 1 · வாடிக்கையாளர் தேர்வு' },
  'sales.customer': { en: 'Customer', ta: 'வாடிக்கையாளர்' },
  'sales.productQty': { en: 'Step 2 · Product & Packets', ta: 'படி 2 · பொருள் & பாக்கெட்டுகள்' },
  'sales.submitOrder': { en: 'Submit Order to Factory', ta: 'ஆர்டர் சமர்ப்பி' },
  'sales.saveOffline': { en: 'Save Order Offline', ta: 'ஆஃப்லைனில் சேமி' },
};

const ITEM_TAMIL_MAP: Record<string, string> = {
  Flour: 'மாவு',
  'Cooking oil': 'சமையல் எண்ணெய்',
  'Salt and spice mix': 'உப்பு & மசாலா',
  '200 g pouch': '200 கி பை',
  'Carton (holds 20 packets)': 'அட்டைப்பெட்டி (20 பாக்கெட்)',
  'Murukku 200 g': 'முறுக்கு 200 கி',
};

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  toggleLang: () => void;
  t: (key: string, fallback?: string) => string;
  localizeItemName: (englishName: string, tamilName?: string | null) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return stored === 'ta' ? 'ta' : 'en';
  });

  const setLang = useCallback((next: AppLanguage) => {
    localStorage.setItem(LANG_STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next: AppLanguage = prev === 'en' ? 'ta' : 'en';
      localStorage.setItem(LANG_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const entry = TRANSLATIONS[key];
      if (!entry) return fallback ?? key;
      return entry[lang];
    },
    [lang]
  );

  const localizeItemName = useCallback(
    (englishName: string, tamilName?: string | null) => {
      if (lang === 'en') return englishName;
      return ITEM_TAMIL_MAP[englishName] ?? tamilName ?? englishName;
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, localizeItemName }),
    [lang, setLang, toggleLang, t, localizeItemName]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
