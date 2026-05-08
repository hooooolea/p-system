import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { AlertList } from '@/components/dashboard/AlertList';
import { CaseList } from '@/components/dashboard/CaseList';
import { TargetList } from '@/components/dashboard/TargetList';
import { VideoPreview } from '@/components/dashboard/VideoPreview';
import { CaseAnalysis } from '@/components/cases/CaseAnalysis';
import { TargetTracking } from '@/components/targets/TargetTracking';
import { VideoAnalysis } from '@/components/video/VideoAnalysis';
import { DecisionSupport } from '@/components/analysis/DecisionSupport';
import { 
  mockStats, 
  mockAlerts, 
  mockCases, 
  mockTargets, 
  mockVideos 
} from '@/data/mock';
import { 
  AlertTriangle, 
  FileText, 
  Target, 
  Video,
  Activity
} from 'lucide-react';

function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="今日预警"
          value={mockStats.totalAlerts}
          change={mockStats.alertTrend}
          changeLabel="较昨日"
          icon={AlertTriangle}
          trend={mockStats.alertTrend > 0 ? 'up' : 'down'}
        />
        <StatsCard
          title="待处理警情"
          value={mockStats.pendingCases}
          change={Math.abs(mockStats.caseTrend)}
          changeLabel="较昨日"
          icon={FileText}
          trend={mockStats.caseTrend > 0 ? 'up' : 'down'}
        />
        <StatsCard
          title="布控目标"
          value={mockStats.activeTargets}
          change={mockStats.targetTrend}
          changeLabel="较昨日"
          icon={Target}
          trend="up"
        />
        <StatsCard
          title="在线监控"
          value={mockStats.onlineCameras}
          change={mockStats.cameraTrend}
          changeLabel="较昨日"
          icon={Video}
          trend="up"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertList alerts={mockAlerts} />
        <CaseList cases={mockCases} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TargetList targets={mockTargets} />
        <VideoPreview videos={mockVideos} />
      </div>
    </div>
  );
}

function CasesModule() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">警情研判</h2>
        <p className="text-muted-foreground">基于大模型的警情语义分析与风险评估</p>
      </div>
      <CaseAnalysis />
    </div>
  );
}

function TargetsModule() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">目标布控</h2>
        <p className="text-muted-foreground">多特征融合的目标溯源与行为预测</p>
      </div>
      <TargetTracking />
    </div>
  );
}

function VideoModule() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">视频实战</h2>
        <p className="text-muted-foreground">跨模态视频检索与智能分析</p>
      </div>
      <VideoAnalysis />
    </div>
  );
}

function AnalysisModule() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">智能分析</h2>
        <p className="text-muted-foreground">AI辅助决策与智能推荐</p>
      </div>
      <DecisionSupport />
    </div>
  );
}

function SettingsModule() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">系统设置</h2>
        <p className="text-muted-foreground">系统配置与参数管理</p>
      </div>
      <div className="police-card p-8 text-center">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
          <Activity className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">系统设置</h3>
        <p className="text-muted-foreground">系统配置功能开发中...</p>
      </div>
    </div>
  );
}

function App() {
  const [activeModule, setActiveModule] = useState('dashboard');

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <Dashboard />;
      case 'cases':
        return <CasesModule />;
      case 'targets':
        return <TargetsModule />;
      case 'video':
        return <VideoModule />;
      case 'analysis':
        return <AnalysisModule />;
      case 'settings':
        return <SettingsModule />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar activeModule={activeModule} onModuleChange={setActiveModule} />
      
      <div className="ml-64 min-h-screen flex flex-col">
        <Header />
        
        <main className="flex-1 p-6">
          {renderModule()}
        </main>
        
        {/* Footer */}
        <footer className="border-t border-border py-4 px-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>警擎智慧警务系统 v1.0</span>
            <span>中国移动通信集团北京有限公司</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
