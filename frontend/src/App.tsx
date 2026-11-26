import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { getHomePathForRole, NAV_ITEMS } from './config/navigation';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import InventoryStockPage from './pages/InventoryStockPage';
import ProductionRunsPage from './pages/ProductionRunsPage';
import PurchasesPage from './pages/PurchasesPage';
import { ForbiddenView, RoleModuleView } from './pages/RoleModuleView';

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-stone-600">
        Loading SnackFlow session...
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const homePath = getHomePathForRole(user.role);

  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<Navigate to={homePath} replace />} />
        <Route path="/" element={<Navigate to={homePath} replace />} />
        {NAV_ITEMS.map((item) => {
          let element = <RoleModuleView item={item} />;
          if (item.id === 'production-runs') {
            element = <ProductionRunsPage />;
          } else if (item.id === 'purchases') {
            element = <PurchasesPage />;
          } else if (item.id === 'inventory') {
            element = <InventoryStockPage />;
          }

          return (
            <Route
              key={item.id}
              path={item.path}
              element={item.roles.includes(user.role) ? element : <ForbiddenView />}
            />
          );
        })}
        <Route path="*" element={<Navigate to={homePath} replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
