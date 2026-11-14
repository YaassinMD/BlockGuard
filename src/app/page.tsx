'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Shield, Search, Link2, QrCode, Database, TrendingUp, CheckCircle2, XCircle,
  ArrowRight, Menu, X, ChevronRight, Lock, Eye, BarChart3, Fingerprint,
  Package, Factory, AlertTriangle, RefreshCw, Info, Zap, Globe, Clock
} from 'lucide-react';
import { signOut } from 'next-auth/react';

/* ───────────────── Types ───────────────── */
interface Product {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  batchNo: string;
  description: string | null;
  qrCode: string;
  blockchainHash: string;
  isVerified: boolean;
  verifiedCount: number;
  createdAt: string;
}

interface Block {
  id: string;
  index: number;
  timestamp: string;
  productId: string;
  productName: string;
  hash: string;
  previousHash: string;
  nonce: number;
  createdAt: string;
}

interface Verification {
  id: string;
  productId: string | null;
  qrCode: string;
  isAuthentic: boolean;
  result: string;
  createdAt: string;
}

  interface AdminStats {
    users: {
      total: number;
      manufacturers: number;
      customers: number;
      activeManufacturers: number;
      inactiveManufacturers: number;
    };
    products: {
      total: number;
    };
    verifications: {
      total: number;
      authentic: number;
      fake: number;
    };
    totalProducts: number;
    totalBlocks: number;
    totalVerifications: number;
    fakeVerifications: number;
    authenticVerifications: number;
    chainIntegrity: boolean;
    categories: Array<{
      category: string;
      _count: { id: number };
    }>;
    generatedAt: string;
  }

  interface Manufacturer {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }

  interface ManufacturerDashboardData {
    statistics: {
      totalProducts: number;
      totalVerifications: number;
      authenticVerifications: number;
      fakeVerifications: number;
    };
    products: Array<{
      id: string;
      name: string;
      category: string;
      batchNo: string;
      qrCode: string;
      createdAt: string;
      verificationCount: number;
    }>;
  }

/* ───────────────── Component ───────────────── */
export default function Home() {
  const [activeSection, setActiveSection] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState<{
    isAuthentic: boolean;
    result: string;
    product: Product | null;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: '', category: '', manufacturer: '', batchNo: '', description: ''
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [scanning, setScanning] = useState(false);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [manufacturerDashboard, setManufacturerDashboard] = useState<ManufacturerDashboardData | null>(null);
  const [manufacturerLoading, setManufacturerLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const fetchData = useCallback(async () => {
    try {
      const [statsRes, blocksRes, productsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/blocks'),
        fetch('/api/products'),
      ]);
      const statsData = await statsRes.json();
      const blocksData = await blocksRes.json();
      const productsData = await productsRes.json();
      setStats(statsData);
      setBlocks(blocksData);
      setProducts(productsData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }, []);

  const seedDatabase = async () => {
    setIsSeeding(true);
    try {
      await fetch('/api/seed', { method: 'POST' });
      await fetchData();
    } catch (err) {
      console.error('Seed failed:', err);
    }
    setIsSeeding(false);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
  let cancelled = false;

  const loadAdminData = async () => {
    try {
      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();
      const role = session?.user?.role ?? null;

      if (cancelled) return;
      setCurrentRole(role);
      setDashboardError('');

      if (role === 'MANUFACTURER') {
        setManufacturerLoading(true);
        const manufacturerRes = await fetch('/api/manufacturer/dashboard');
        if (!manufacturerRes.ok) throw new Error('Failed to load manufacturer data');
        const manufacturerData = await manufacturerRes.json();
        if (!cancelled) setManufacturerDashboard(manufacturerData);
        return;
      }

      if (role !== 'ADMIN') return;

      setAdminLoading(true);

      const [statsRes, manufacturersRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/manufacturers'),
      ]);

      if (!statsRes.ok || !manufacturersRes.ok) {
        throw new Error('Failed to load admin data');
      }

      const [statsData, manufacturersData] = await Promise.all([
        statsRes.json(),
        manufacturersRes.json(),
      ]);

      if (!cancelled) {
        setAdminStats(statsData);
        setManufacturers(manufacturersData.manufacturers ?? []);
      }
    } catch (error) {
      console.error('Admin data loading failed:', error);
      if (!cancelled) setDashboardError('Dashboard data could not be loaded. Please refresh and try again.');
    } finally {
      if (!cancelled) {
        setAdminLoading(false);
        setManufacturerLoading(false);
      }
    }
  };

  loadAdminData();

  return () => {
    cancelled = true;
  };
}, []);
  const toggleManufacturerStatus = async (
    id: string,
    isActive: boolean
  ) => {
    try {
      const res = await fetch('/api/admin/manufacturers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update manufacturer');
      }

      setManufacturers(prev =>
        prev.map(manufacturer =>
          manufacturer.id === id
            ? { ...manufacturer, isActive }
            : manufacturer
        )
      );

      toast.success(
        `Manufacturer ${isActive ? 'activated' : 'deactivated'} successfully`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong'
      );
    }
  };
  const handleVerify = async () => {
    if (!verifyCode.trim()) return;
    setIsVerifying(true);
    setScanning(true);
    setVerifyResult(null);

    // Simulate scanning animation
    await new Promise(r => setTimeout(r, 1500));
    setScanning(false);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode: verifyCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyResult({
          isAuthentic: false,
          result: data.error || 'Verification could not be completed. Please try again.',
          product: null,
        });
        setIsVerifying(false);
        return;
      }
      setVerifyResult(data);
    } catch (err) {
      setVerifyResult({
        isAuthentic: false,
        result: 'Verification failed. Please try again.',
        product: null,
      });
    }
    setIsVerifying(false);
  };

  const handleRegister = async () => {
    if (!registerForm.name || !registerForm.category || !registerForm.manufacturer || !registerForm.batchNo) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsRegistering(true);
    setRegisterError('');
    setRegisterSuccess(false);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (res.ok) {
        setRegisterSuccess(true);
        setRegisterForm({ name: '', category: '', manufacturer: '', batchNo: '', description: '' });
        await fetchData();
        toast.success(`Block mined! Product "${data.name}" added to blockchain with QR: ${data.qrCode}`);
        setTimeout(() => setRegisterSuccess(false), 4000);
      } else {
        const errorMsg = data.error || 'Registration failed. Please try again.';
        setRegisterError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error. Please try again.';
      setRegisterError(msg);
      toast.error(msg);
    }
    setIsRegistering(false);
  };

  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'verify', label: 'Verify Product' },
    ...(currentRole === 'ADMIN' || currentRole === 'MANUFACTURER' ? [{ id: 'register', label: 'Register' }] : []),
    { id: 'blockchain', label: 'Blockchain' },
    { id: 'dashboard', label: 'Dashboard' },
  ];

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Quick-try codes
  const quickCodes = products.length > 0
    ? [
        { label: 'Try Authentic', code: products[0].qrCode },
        { label: 'Try Fake', code: 'FAKE-XXXX-YYYY-ZZZZ' },
      ]
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ───── Navigation ───── */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => scrollTo('home')}>
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                BlockGuard
              </span>
            </div>
            <div className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === item.id
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="hidden md:flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => scrollTo('verify')}>
                <QrCode className="w-4 h-4 mr-2" />
                Verify Now
              </Button>
              {currentRole ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => signOut({ callbackUrl: '/' })}
                >
                  Logout ({currentRole})
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.assign('/login')}
                >
                  Login
                </Button>
              )}
            </div>
            <button
              type="button"
              className="md:hidden"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t bg-background"
            >
              <div className="px-4 py-3 space-y-1">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => scrollTo(item.id)}
                    className={`block w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${
                      activeSection === item.id
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                {currentRole ? (
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => signOut({ callbackUrl: '/' })}
                    >
                      Logout ({currentRole})
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => window.location.assign('/login')}
                    >
                      Login
                    </Button>
                  )}
                <Button size="sm" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => scrollTo('verify')}>
                  <QrCode className="w-4 h-4 mr-2" />
                  Verify Now
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className="flex-1">
        {/* ═══════ HERO SECTION ═══════ */}
        <section id="home" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-950 dark:via-emerald-950/20 dark:to-gray-950" />
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%2310b981\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
              >
                <Badge className="mb-4 bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-200">
                  <Zap className="w-3 h-3 mr-1" />
                  Blockchain-Powered Authentication
                </Badge>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
                  Detect{' '}
                  <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                    Fake Products
                  </span>{' '}
                  with Blockchain Technology
                </h1>
                <p className="mt-6 text-lg text-gray-600 dark:text-gray-300 max-w-xl leading-relaxed">
                  BlockGuard leverages the power of decentralized blockchain to create an immutable product
                  registry. Every authentic product is recorded on the chain, enabling instant verification
                  and eliminating counterfeit goods from the supply chain.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30" onClick={() => scrollTo('verify')}>
                    <Search className="w-5 h-5 mr-2" />
                    Verify a Product
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => scrollTo('blockchain')}>
                    <Link2 className="w-5 h-5 mr-2" />
                    Explore Blockchain
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <div className="mt-10 flex items-center gap-8 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />
                    <span>Immutable Records</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <span>Instant Verification</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-500" />
                    <span>Decentralized</span>
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative hidden lg:block"
              >
                <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-emerald-200/50 dark:shadow-emerald-900/20">
                  <img src="/hero-blockchain.png" alt="Blockchain Technology" className="w-full h-auto" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                </div>
                {/* Floating stats cards */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute -bottom-4 -left-4 bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{stats?.totalProducts ?? 0}</p>
                      <p className="text-xs text-gray-500">Products Registered</p>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="absolute -top-4 -right-4 bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <Database className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{stats?.totalBlocks ?? 0}</p>
                      <p className="text-xs text-gray-500">Blocks Created</p>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══════ HOW IT WORKS ═══════ */}
        <section className="py-20 bg-white dark:bg-gray-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <Badge variant="secondary" className="mb-4">How It Works</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                Simple 4-Step Verification Process
              </h2>
              <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                Our blockchain-based system makes product authentication incredibly simple for both
                manufacturers and consumers.
              </p>
            </motion.div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  icon: <Package className="w-8 h-8" />,
                  title: 'Product Registration',
                  desc: 'Manufacturers register products on the blockchain with unique QR codes, batch numbers, and cryptographic hashes that become permanently embedded in the chain.',
                  step: '01',
                },
                {
                  icon: <QrCode className="w-8 h-8" />,
                  title: 'QR Code Generation',
                  desc: 'Each registered product receives a unique blockchain-verified QR code that contains the product\'s digital fingerprint and links directly to its blockchain record.',
                  step: '02',
                },
                {
                  icon: <Search className="w-8 h-8" />,
                  title: 'Consumer Scanning',
                  desc: 'Consumers simply scan or enter the QR code found on the product packaging through our verification system to instantly authenticate the product.',
                  step: '03',
                },
                {
                  icon: <Shield className="w-8 h-8" />,
                  title: 'Instant Verification',
                  desc: 'The system cross-references the QR code against the blockchain ledger. Results are displayed within seconds confirming if the product is authentic or counterfeit.',
                  step: '04',
                },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className="relative border-2 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all hover:shadow-lg group h-full">
                    <CardHeader>
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-14 h-14 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900 transition-colors">
                          {item.icon}
                        </div>
                        <span className="text-4xl font-black text-emerald-100 dark:text-emerald-900 group-hover:text-emerald-200 dark:group-hover:text-emerald-800 transition-colors">
                          {item.step}
                        </span>
                      </div>
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{item.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ FEATURES ═══════ */}
        <section className="py-20 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <Badge variant="secondary" className="mb-4">Features</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                Why BlockGuard?
              </h2>
              <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                A comprehensive solution for product authentication powered by cutting-edge blockchain technology.
              </p>
            </motion.div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: <Lock className="w-6 h-6" />, title: 'Tamper-Proof Records', desc: 'Every product entry is cryptographically sealed in a block, making it impossible to alter or delete records without detection.' },
                { icon: <Eye className="w-6 h-6" />, title: 'Full Transparency', desc: 'Access the complete product history, from manufacturing to point of sale. Every transaction is visible and verifiable.' },
                { icon: <BarChart3 className="w-6 h-6" />, title: 'Real-Time Analytics', desc: 'Track verification statistics, identify counterfeit hotspots, and monitor the health of the product authentication network.' },
                { icon: <Fingerprint className="w-6 h-6" />, title: 'Digital Fingerprinting', desc: 'Each product receives a unique cryptographic hash that serves as its digital identity on the blockchain.' },
                { icon: <Factory className="w-6 h-6" />, title: 'Manufacturer Portal', desc: 'Seamless product registration system for manufacturers to add new products to the blockchain with complete traceability.' },
                { icon: <AlertTriangle className="w-6 h-6" />, title: 'Counterfeit Detection', desc: 'Advanced algorithms detect patterns in counterfeit attempts and alert authorities about suspicious verification activities.' },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="h-full hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="w-12 h-12 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 mb-3">
                        {item.icon}
                      </div>
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{item.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ VERIFY PRODUCT ═══════ */}
        <section id="verify" className="py-20 bg-white dark:bg-gray-950">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <Badge className="mb-4 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-200">
                <Search className="w-3 h-3 mr-1" />
                Product Verification
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                Is Your Product Authentic?
              </h2>
              <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                Enter the QR code found on your product to instantly verify its authenticity
                against the blockchain ledger.
              </p>
              <div className="mt-3 mx-auto max-w-lg">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-800">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>Note:</strong> This is a demo blockchain. Only products registered through our system will
                    be recognized. Real-world QR codes (e.g., FIZZ, Pepsi, medicine bottles) use their own company
                    tracking systems and are <strong> not connected</strong> to this blockchain. Use the demo buttons below to test.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Card className="shadow-xl border-2">
                <CardContent className="p-6 sm:p-8">
                  {/* Scanning animation */}
                  <AnimatePresence>
                    {scanning && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mb-6 flex flex-col items-center gap-3"
                      >
                        <div className="relative w-24 h-24">
                          <div className="absolute inset-0 rounded-full border-4 border-emerald-200" />
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                            className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-600"
                          />
                          <QrCode className="absolute inset-0 m-auto w-8 h-8 text-emerald-600" />
                        </div>
                        <p className="text-sm font-medium text-emerald-600">Scanning blockchain...</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        placeholder="Enter a BlockGuard QR code (e.g., BPC-XXXX-YYYY-ZZZZ-WWWW)"
                        className="pl-10 h-12 text-base"
                        value={verifyCode}
                        onChange={e => setVerifyCode(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleVerify()}
                        disabled={isVerifying}
                      />
                    </div>
                    <Button
                      className="h-12 px-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      onClick={handleVerify}
                      disabled={isVerifying || !verifyCode.trim()}
                    >
                      {isVerifying ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          >
                            <RefreshCw className="w-5 h-5 mr-2" />
                          </motion.div>
                          Verifying...
                        </>
                      ) : (
                        <>
                          <Search className="w-5 h-5 mr-2" />
                          Verify
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Quick try buttons */}
                  {quickCodes.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800">
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium mb-2">
                        Quick Demo — click a code below to test:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {quickCodes.map((qc, i) => (
                          <button
                            key={i}
                            onClick={() => { setVerifyCode(qc.code); }}
                            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                              qc.label === 'Try Fake'
                                ? 'border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-gray-900'
                                : 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-gray-900'
                            }`}
                          >
                            {qc.label === 'Try Fake' ? 'X' : '✓'} {qc.label}: {qc.code}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Result */}
                  <AnimatePresence>
                    {verifyResult && !scanning && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-6"
                      >
                        <Separator className="mb-6" />
                        <div className={`p-6 rounded-xl border-2 ${
                          verifyResult.isAuthentic
                            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800'
                            : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                        }`}>
                          <div className="flex items-start gap-4">
                            {verifyResult.isAuthentic ? (
                              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
                                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center flex-shrink-0">
                                <XCircle className="w-6 h-6 text-red-600" />
                              </div>
                            )}
                            <div className="flex-1">
                              <h3 className={`text-lg font-bold ${
                                verifyResult.isAuthentic ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'
                              }`}>
                                {verifyResult.isAuthentic ? 'AUTHENTIC PRODUCT' : 'COUNTERFEIT DETECTED'}
                              </h3>
                              <p className={`text-sm mt-1 ${
                                verifyResult.isAuthentic ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                              }`}>
                                {verifyResult.result}
                              </p>
                              {verifyResult.product && (
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                  {[
                                    { label: 'Product', value: verifyResult.product.name },
                                    { label: 'Category', value: verifyResult.product.category },
                                    { label: 'Manufacturer', value: verifyResult.product.manufacturer },
                                    { label: 'Batch No', value: verifyResult.product.batchNo },
                                    { label: 'Times Verified', value: String(verifyResult.product.verifiedCount) },
                                    { label: 'Registered', value: new Date(verifyResult.product.createdAt).toLocaleDateString() },
                                  ].map((field, j) => (
                                    <div key={j}>
                                      <p className="text-xs text-gray-500 uppercase tracking-wide">{field.label}</p>
                                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{field.value}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {verifyResult.isAuthentic && verifyResult.product && (
                                <div className="mt-4 p-3 bg-white/50 dark:bg-black/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                  <p className="text-xs text-gray-500">Blockchain Hash</p>
                                  <p className="text-xs font-mono text-emerald-700 dark:text-emerald-300 mt-1 break-all">
                                    {verifyResult.product.blockchainHash}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* ═══════ REGISTER PRODUCT ═══════ */}
        {(currentRole === 'ADMIN' || currentRole === 'MANUFACTURER') && <section id="register" className="py-20 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <Badge variant="secondary" className="mb-4">
                <Package className="w-3 h-3 mr-1" />
                Manufacturer Portal
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                Register Your Product
              </h2>
              <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                Add products to the blockchain registry. Each product will receive a unique QR code
                and be permanently recorded on the chain.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Card className="shadow-xl">
                <CardHeader>
                  <CardTitle>New Product Registration</CardTitle>
                  <CardDescription>Fill in the product details to register on the blockchain</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Product Name *</Label>
                      <Input
                        placeholder="e.g., Premium Smartwatch Pro X1"
                        value={registerForm.name}
                        onChange={e => setRegisterForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category *</Label>
                      <Select value={registerForm.category} onValueChange={v => setRegisterForm(prev => ({ ...prev, category: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Electronics">Electronics</SelectItem>
                          <SelectItem value="Food & Beverages">Food & Beverages</SelectItem>
                          <SelectItem value="Fashion & Accessories">Fashion & Accessories</SelectItem>
                          <SelectItem value="Health & Medicine">Health & Medicine</SelectItem>
                          <SelectItem value="Cosmetics">Cosmetics</SelectItem>
                          <SelectItem value="Automotive">Automotive</SelectItem>
                          <SelectItem value="Sports & Outdoor">Sports & Outdoor</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Manufacturer *</Label>
                      <Input
                        placeholder="e.g., TechCorp Industries"
                        value={registerForm.manufacturer}
                        onChange={e => setRegisterForm(prev => ({ ...prev, manufacturer: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Batch Number *</Label>
                      <Input
                        placeholder="e.g., TC-2024-001"
                        value={registerForm.batchNo}
                        onChange={e => setRegisterForm(prev => ({ ...prev, batchNo: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Product description, features, manufacturing details..."
                      rows={3}
                      value={registerForm.description}
                      onChange={e => setRegisterForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleRegister}
                      disabled={
                        isRegistering ||
                        !registerForm.name ||
                        !registerForm.category ||
                        !registerForm.manufacturer ||
                        !registerForm.batchNo
                      }
                    >
                      {isRegistering ? (
                        <>
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                          </motion.div>
                          Mining Block...
                        </>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4 mr-2" />
                          Register on Blockchain
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setRegisterForm({ name: '', category: '', manufacturer: '', batchNo: '', description: '' })}>
                      Clear
                    </Button>
                  </div>
                  <AnimatePresence>
                    {registerSuccess && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                            Product successfully registered on the blockchain! A new block has been mined and added to the chain. Check the Blockchain Explorer to see it.
                          </p>
                        </div>
                      </motion.div>
                    )}
                    {registerError && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800"
                      >
                        <div className="flex items-center gap-2">
                          <XCircle className="w-5 h-5 text-red-600" />
                          <p className="text-sm font-medium text-red-800 dark:text-red-200">{registerError}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>}

        {/* ═══════ BLOCKCHAIN EXPLORER ═══════ */}
        <section id="blockchain" className="py-20 bg-white dark:bg-gray-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <Badge variant="secondary" className="mb-4">
                <Link2 className="w-3 h-3 mr-1" />
                Blockchain Explorer
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                Explore the Chain
              </h2>
              <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                Browse all blocks in the product verification blockchain. Click on any block to see detailed information.
              </p>
            </motion.div>

              {/* ADMIN DASHBOARD */}
              {currentRole === 'ADMIN' && (
                <div className="mb-10 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge className="bg-purple-100 text-purple-800">
                        Admin Panel
                      </Badge>
                      <h3 className="text-2xl font-bold mt-2">
                        Administration Overview
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Manage platform users and monitor system activity.
                      </p>
                    </div>
                    {adminLoading && (
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                    )}
                  </div>

                  {dashboardError && <p role="alert" className="text-sm text-red-600">{dashboardError}</p>}
                  {!adminLoading && !dashboardError && !adminStats && (
                    <p className="text-sm text-gray-500">No administration statistics are available yet.</p>
                  )}

                  {adminStats && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: 'Total Users', value: adminStats.users.total },
                        { label: 'Manufacturers', value: adminStats.users.manufacturers },
                        { label: 'Customers', value: adminStats.users.customers },
                        { label: 'Active Manufacturers', value: adminStats.users.activeManufacturers },
                        { label: 'Registered Products', value: adminStats.products.total },
                        { label: 'Total Verifications', value: adminStats.verifications.total },
                        { label: 'Authentic Results', value: adminStats.verifications.authentic },
                        { label: 'Fake Results', value: adminStats.verifications.fake },
                      ].map((item) => (
                        <Card key={item.label}>
                          <CardContent className="p-5">
                            <p className="text-xs text-gray-500 uppercase tracking-wide">
                              {item.label}
                            </p>
                            <p className="text-2xl font-bold mt-2">
                              {item.value}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Manufacturer Management */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Factory className="w-5 h-5 text-emerald-600" />
                        Manufacturer Management
                      </CardTitle>
                      <CardDescription>
                        View manufacturer accounts and manage their access.
                      </CardDescription>
                    </CardHeader>

                    <CardContent>
                      {manufacturers.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-6">
                          No manufacturer accounts found.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {manufacturers.map((manufacturer) => (
                            <div
                              key={manufacturer.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg"
                            >
                              <div>
                                <p className="font-semibold">
                                  {manufacturer.name}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {manufacturer.email}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  Joined: {new Date(manufacturer.createdAt).toLocaleDateString()}
                                </p>
                              </div>

                              <div className="flex items-center gap-3">
                                <Badge
                                  className={
                                    manufacturer.isActive
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-red-100 text-red-800'
                                  }
                                >
                                  {manufacturer.isActive ? 'Active' : 'Inactive'}
                                </Badge>

                                <Button
                                  size="sm"
                                  variant={manufacturer.isActive ? 'destructive' : 'default'}
                                  onClick={() =>
                                    toggleManufacturerStatus(
                                      manufacturer.id,
                                      !manufacturer.isActive
                                    )
                                  }
                                >
                                  {manufacturer.isActive ? 'Deactivate' : 'Activate'}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

            {/* Chain integrity */}
            {currentRole !== 'MANUFACTURER' && stats && (
              <div className="mb-8 flex items-center justify-center gap-2">
                <div className={`w-3 h-3 rounded-full ${stats.chainIntegrity ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Chain Integrity: {stats.chainIntegrity ? 'VALID' : 'COMPROMISED'}
                </span>
                <span className="text-sm text-gray-400">| {blocks.length} blocks</span>
              </div>
            )}

            {/* Blocks visual chain */}
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-2 min-w-max justify-center">
                {blocks.map((block, i) => (
                  <motion.div
                    key={block.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-2"
                  >
                    <Dialog>
                      <DialogTrigger asChild>
                        <button
                          onClick={() => setSelectedBlock(block)}
                          className={`cursor-pointer p-3 rounded-xl border-2 transition-all hover:shadow-md text-left min-w-[140px] ${
                            block.index === 0
                              ? 'bg-gray-900 text-white border-gray-700 hover:border-gray-500'
                              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-emerald-300'
                          }`}
                        >
                          <p className={`text-xs font-bold ${block.index === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>
                            Block #{block.index}
                          </p>
                          <p className="text-sm font-medium mt-1 truncate max-w-[120px]">
                            {block.index === 0 ? 'Genesis' : block.productName.length > 15 ? block.productName.substring(0, 15) + '...' : block.productName}
                          </p>
                          <p className="text-xs text-gray-400 font-mono mt-1">
                            {block.hash.substring(0, 8)}...
                          </p>
                          <div className="flex items-center gap-1 mt-2">
                            <div className={`w-2 h-2 rounded-full ${block.index === 0 ? 'bg-gray-500' : 'bg-emerald-500'}`} />
                            <span className={`text-xs ${block.index === 0 ? 'text-gray-500' : 'text-emerald-600'}`}>
                              {block.nonce} nonces
                            </span>
                          </div>
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Database className="w-5 h-5 text-emerald-600" />
                            Block #{block.index}
                          </DialogTitle>
                          <DialogDescription>
                            {block.index === 0 ? 'Genesis Block - Chain Origin' : `Product: ${block.productName}`}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 mt-4">
                          {[
                            { label: 'Block Hash', value: block.hash },
                            { label: 'Previous Hash', value: block.previousHash },
                            { label: 'Timestamp', value: new Date(block.timestamp).toLocaleString() },
                            { label: 'Nonce', value: String(block.nonce) },
                            { label: 'Product ID', value: block.productId },
                          ].map((field, j) => (
                            <div key={j} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border">
                              <p className="text-xs text-gray-500 uppercase tracking-wide">{field.label}</p>
                              <p className="text-xs font-mono text-gray-700 dark:text-gray-300 mt-1 break-all">{field.value}</p>
                            </div>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                    {i < blocks.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-700 flex-shrink-0" />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Products registered */}
            <div className="mt-12">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                Registered Products
              </h3>
              {products.filter(p => p.id !== 'genesis').length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No products registered yet. Use the Register section to add products.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.filter(p => p.id !== 'genesis').map((product, i) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card className="hover:shadow-md transition-shadow h-full">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{product.name}</CardTitle>
                              <CardDescription className="mt-1">{product.manufacturer}</CardDescription>
                            </div>
                            <Badge className={product.isVerified ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}>
                              {product.isVerified ? 'Verified' : 'Pending'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Category</span>
                            <span className="font-medium">{product.category}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Batch No</span>
                            <span className="font-mono font-medium">{product.batchNo}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">QR Code</span>
                            <button
                              onClick={() => { setVerifyCode(product.qrCode); scrollTo('verify'); }}
                              className="font-mono text-emerald-600 hover:underline cursor-pointer"
                            >
                              {product.qrCode}
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Verifications</span>
                            <span className="font-medium">{product.verifiedCount}</span>
                          </div>
                          <Separator className="my-2" />
                          <p className="text-xs text-gray-400 font-mono break-all">
                            {product.blockchainHash.substring(0, 32)}...
                          </p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══════ DASHBOARD ═══════ */}
        <section id="dashboard" className="py-20 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <Badge variant="secondary" className="mb-4">
                <BarChart3 className="w-3 h-3 mr-1" />
                Dashboard
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                Network Analytics
              </h2>
              <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                Real-time statistics and insights about the product verification blockchain network.
              </p>
            </motion.div>

            {currentRole === 'MANUFACTURER' && (
              <div className="mb-10 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge className="bg-emerald-100 text-emerald-800">Manufacturer Portal</Badge>
                    <h3 className="text-2xl font-bold mt-2">Manufacturer Dashboard</h3>
                    <p className="text-sm text-gray-500 mt-1">Products and verification activity for your account.</p>
                  </div>
                  {manufacturerLoading && <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />}
                </div>
                {dashboardError && <p role="alert" className="text-sm text-red-600">{dashboardError}</p>}
                {!manufacturerLoading && !dashboardError && !manufacturerDashboard && (
                  <p className="text-sm text-gray-500">Dashboard data is not available yet.</p>
                )}
                {manufacturerDashboard && <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Registered Products', value: manufacturerDashboard.statistics.totalProducts },
                      { label: 'Verification Attempts', value: manufacturerDashboard.statistics.totalVerifications },
                      { label: 'Authentic Results', value: manufacturerDashboard.statistics.authenticVerifications },
                      { label: 'Fake Results', value: manufacturerDashboard.statistics.fakeVerifications },
                    ].map((item) => <Card key={item.label}><CardContent className="p-5">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{item.label}</p>
                      <p className="text-2xl font-bold mt-2">{item.value}</p>
                    </CardContent></Card>)}
                  </div>
                  <Card>
                    <CardHeader><CardTitle>Your Registered Products</CardTitle><CardDescription>Products registered by your manufacturer account.</CardDescription></CardHeader>
                    <CardContent>
                      {manufacturerDashboard.products.length === 0 ? <p className="text-sm text-gray-500 text-center py-6">No products registered yet. Use the Register section to add products.</p> :
                        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm text-left">
                          <thead><tr className="border-b text-gray-500"><th className="py-3 pr-4">Product</th><th className="py-3 pr-4">Category</th><th className="py-3 pr-4">Batch</th><th className="py-3 pr-4">QR Code</th><th className="py-3 pr-4">Registered</th><th className="py-3">Verifications</th></tr></thead>
                          <tbody>{manufacturerDashboard.products.map(product => <tr key={product.id} className="border-b last:border-0">
                            <td className="py-3 pr-4 font-medium">{product.name}</td><td className="py-3 pr-4">{product.category}</td><td className="py-3 pr-4">{product.batchNo}</td><td className="py-3 pr-4 font-mono">{product.qrCode}</td><td className="py-3 pr-4">{new Date(product.createdAt).toLocaleDateString()}</td><td className="py-3">{product.verificationCount}</td>
                          </tr>)}</tbody>
                        </table></div>}
                    </CardContent>
                  </Card>
                </>}
              </div>
            )}

            {currentRole !== 'MANUFACTURER' && stats && (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {[
                    { label: 'Products Registered', value: stats.totalProducts, icon: <Package className="w-5 h-5" />, color: 'emerald' },
                    { label: 'Blocks Mined', value: stats.totalBlocks, icon: <Database className="w-5 h-5" />, color: 'blue' },
                    { label: 'Total Verifications', value: stats.totalVerifications, icon: <Search className="w-5 h-5" />, color: 'purple' },
                    { label: 'Fakes Detected', value: stats.fakeVerifications, icon: <AlertTriangle className="w-5 h-5" />, color: 'red' },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.95 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card className="h-full">
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{stat.label}</span>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              stat.color === 'emerald' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950' :
                              stat.color === 'blue' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950' :
                              stat.color === 'purple' ? 'bg-purple-50 text-purple-600 dark:bg-purple-950' :
                              'bg-red-50 text-red-600 dark:bg-red-950'
                            }`}>
                              {stat.icon}
                            </div>
                          </div>
                          <p className="text-2xl sm:text-3xl font-bold">{stat.value}</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Verification stats */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                        Verification Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Authentic Products</span>
                            <span className="font-semibold text-emerald-600">{stats.authenticVerifications}</span>
                          </div>
                          <Progress
                            value={stats.totalVerifications > 0 ? (stats.authenticVerifications / stats.totalVerifications) * 100 : 0}
                            className="h-3"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Counterfeit Detected</span>
                            <span className="font-semibold text-red-600">{stats.fakeVerifications}</span>
                          </div>
                          <Progress
                            value={stats.totalVerifications > 0 ? (stats.fakeVerifications / stats.totalVerifications) * 100 : 0}
                            className="h-3"
                          />
                        </div>
                        {stats.totalVerifications > 0 && (
                          <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                            <p className="text-xs text-gray-500">Authenticity Rate</p>
                            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                              {((stats.authenticVerifications / stats.totalVerifications) * 100).toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Category breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                        Product Categories
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {stats.categories.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">No data available</p>
                      ) : (
                        <div className="space-y-3">
                          {stats.categories.map((cat, i) => {
                            const maxCount = Math.max(...stats.categories.map(c => c._count.id));
                            const percentage = (cat._count.id / maxCount) * 100;
                            return (
                              <div key={i}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-gray-600 dark:text-gray-400">{cat.category}</span>
                                  <span className="font-semibold">{cat._count.id}</span>
                                </div>
                                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    whileInView={{ width: `${percentage}%` }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.8, delay: i * 0.1 }}
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                </div>
              </>
            )}
          </div>
        </section>

        {/* ═══════ TECHNOLOGY SECTION ═══════ */}
        <section className="py-20 bg-white dark:bg-gray-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <Badge variant="secondary" className="mb-4">Technology</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                Powered by Blockchain
              </h2>
              <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                Understanding how blockchain technology ensures product authenticity and creates an unbreakable chain of trust.
              </p>
            </motion.div>
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 mb-2">
                    <Database className="w-6 h-6" />
                  </div>
                  <CardTitle>How Blockchain Secures Products</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  <p>
                    Each product registered in our system is stored as a &ldquo;block&rdquo; on the blockchain. A block contains
                    essential product data including the product name, manufacturer details, batch number, and a unique QR
                    code. This data is combined with a cryptographic hash of the previous block, creating an unbreakable chain
                    where each block is intrinsically linked to its predecessor.
                  </p>
                  <p>
                    The hash function used ensures that any attempt to modify the data in a block would result in a completely
                    different hash value, immediately revealing tampering. Additionally, the &ldquo;nonce&rdquo; value used in the mining
                    process adds an extra layer of computational security, making it prohibitively expensive for bad actors to
                    rewrite the chain.
                  </p>
                  <p>
                    This means that once a product is registered, its record becomes permanent and immutable. Consumers can
                    trust that the verification results they receive are accurate and have not been manipulated by any party.
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600 mb-2">
                    <Shield className="w-6 h-6" />
                  </div>
                  <CardTitle>Benefits for Stakeholders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { title: 'For Consumers', desc: 'Instant product authentication, protection from counterfeit goods, and confidence in purchase decisions through transparent blockchain verification.' },
                    { title: 'For Manufacturers', desc: 'Brand protection, reduced revenue loss from counterfeits, enhanced consumer trust, and real-time visibility into product verification across the supply chain.' },
                    { title: 'For Regulators', desc: 'Access to an immutable product registry, simplified compliance auditing, and the ability to trace products back to their origin with complete transparency.' },
                    { title: 'For Retailers', desc: 'Streamlined inventory authentication, reduced liability from selling counterfeit products, and improved customer satisfaction through verified authentic products.' },
                  ].map((item, i) => (
                    <div key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{item.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* ───── Footer ───── */}
      <footer className="border-t bg-gray-50 dark:bg-gray-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-white">BlockGuard</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Leveraging blockchain technology to protect consumers from counterfeit products and build trust in global supply chains.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Platform</h4>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li><button onClick={() => scrollTo('verify')} className="hover:text-emerald-600 transition-colors">Verify Product</button></li>
                <li><button onClick={() => scrollTo('register')} className="hover:text-emerald-600 transition-colors">Register Product</button></li>
                <li><button onClick={() => scrollTo('blockchain')} className="hover:text-emerald-600 transition-colors">Blockchain Explorer</button></li>
                <li><button onClick={() => scrollTo('dashboard')} className="hover:text-emerald-600 transition-colors">Dashboard</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li><span className="hover:text-emerald-600 transition-colors cursor-pointer">Documentation</span></li>
                <li><span className="hover:text-emerald-600 transition-colors cursor-pointer">API Reference</span></li>
                <li><span className="hover:text-emerald-600 transition-colors cursor-pointer">White Paper</span></li>
                <li><span className="hover:text-emerald-600 transition-colors cursor-pointer">Support</span></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Technology</h4>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li className="flex items-center gap-2"><Link2 className="w-4 h-4" />Blockchain</li>
                <li className="flex items-center gap-2"><Fingerprint className="w-4 h-4" />Cryptographic Hashing</li>
                <li className="flex items-center gap-2"><QrCode className="w-4 h-4" />QR Authentication</li>
                <li className="flex items-center gap-2"><Database className="w-4 h-4" />Distributed Ledger</li>
              </ul>
            </div>
          </div>
          <Separator className="my-8" />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              BlockGuard - Fake Product Identification Using Blockchain. Educational Project.
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className={`w-2 h-2 rounded-full ${stats?.chainIntegrity ? 'bg-emerald-500' : 'bg-red-500'}`} />
              Chain Status: {stats?.chainIntegrity ? 'Healthy' : 'Alert'}
              <span className="mx-1">|</span>
              Network: {blocks.length} blocks
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
