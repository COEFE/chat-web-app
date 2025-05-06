'use client';

import { useState, useEffect } from 'react';
import { getAuth } from "firebase/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Loader2, DollarSign, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

// Types
interface DashboardData {
  currentPeriodNetIncome: number;
  cashPosition: number;
  topRevenueSources: TopRevenueSource[];
  topExpenses: TopExpense[];
  accountsReceivable: number;
  accountsPayable: number;
  quickRatio: number | null;
  revenueMonthly: MonthlyData[];
  expenseMonthly: MonthlyData[];
}

interface TopRevenueSource {
  accountName: string;
  accountCode: string;
  amount: number;
  percentage: number;
}

interface TopExpense {
  accountName: string;
  accountCode: string;
  amount: number;
  percentage: number;
}

interface MonthlyData {
  month: string;
  amount: number;
}

// Currency formatter
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

// Component
export default function FinancialDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A569BD'];
  const positiveColor = '#10B981'; // green
  const negativeColor = '#EF4444'; // red

  // Fetch dashboard data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          throw new Error("You must be logged in to view the dashboard");
        }
        
        const token = await user.getIdToken();
        
        const response = await fetch('/api/dashboard', {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
          throw new Error(responseData.error || "Failed to fetch dashboard data");
        }
        
        setData(responseData.dashboard);
      } catch (err: any) {
        setError(err.message || "An error occurred");
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Financial Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  <Skeleton className="h-4 w-[150px]" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[120px]" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="col-span-1">
              <CardHeader>
                <Skeleton className="h-5 w-[200px]" />
              </CardHeader>
              <CardContent className="h-[300px]">
                <Skeleton className="h-full w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center text-red-600">
              <AlertCircle className="mr-2 h-5 w-5" />
              Error Loading Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{error}</p>
            <p className="mt-2">Please try refreshing the page or contact support if the issue persists.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No data
  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Financial Data Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p>No financial data is currently available. Start by creating journal entries.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare monthly comparison chart data
  const monthlyComparisonData = data.revenueMonthly.map((item, index) => ({
    month: item.month,
    revenue: item.amount,
    expenses: data.expenseMonthly[index]?.amount || 0,
    profit: item.amount - (data.expenseMonthly[index]?.amount || 0)
  }));

  // Format top revenue sources and expenses for pie charts
  const topRevenueSourcesForChart = data.topRevenueSources.map((source, index) => ({
    name: source.accountName,
    value: source.amount,
    color: COLORS[index % COLORS.length]
  }));

  const topExpensesForChart = data.topExpenses.map((expense, index) => ({
    name: expense.accountName,
    value: expense.amount,
    color: COLORS[index % COLORS.length]
  }));

  // Calculate metrics
  const netIncomeColor = data.currentPeriodNetIncome >= 0 ? positiveColor : negativeColor;
  const netIncomeIcon = data.currentPeriodNetIncome >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Financial Dashboard</h1>
      
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Period Net Income</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <div style={{ color: netIncomeColor }} className="mr-2">
                {netIncomeIcon}
              </div>
              <div className="text-2xl font-bold" style={{ color: netIncomeColor }}>
                {formatCurrency(data.currentPeriodNetIncome)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Position</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
              <div className="text-2xl font-bold">{formatCurrency(data.cashPosition)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Accounts Receivable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.accountsReceivable)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Ratio</CardTitle>
            <CardDescription className="text-xs">Cash + A/R / Current Liabilities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.quickRatio !== null ? data.quickRatio.toFixed(2) : 'N/A'}
            </div>
            {data.quickRatio !== null && (
              <Badge className={data.quickRatio >= 1 ? 'bg-green-500' : 'bg-yellow-500'}>
                {data.quickRatio >= 1 ? 'Healthy' : 'Caution'}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Monthly Comparison */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Monthly Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyComparisonData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#10B981" />
                <Bar dataKey="expenses" name="Expenses" fill="#EF4444" />
                <Bar dataKey="profit" name="Profit" fill="#6366F1" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Sources Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topRevenueSourcesForChart}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {topRevenueSourcesForChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-3">
              {data.topRevenueSources.map((source) => (
                <div key={source.accountCode} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{source.accountName}</div>
                    <div className="text-sm font-medium">{formatCurrency(source.amount)}</div>
                  </div>
                  <Progress value={source.percentage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topExpensesForChart}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {topExpensesForChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-3">
              {data.topExpenses.map((expense) => (
                <div key={expense.accountCode} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{expense.accountName}</div>
                    <div className="text-sm font-medium">{formatCurrency(expense.amount)}</div>
                  </div>
                  <Progress value={expense.percentage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
