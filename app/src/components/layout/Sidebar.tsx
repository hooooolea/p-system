import { 
  LayoutDashboard, 
  FileText, 
  Target, 
  Video, 
  BrainCircuit,
  Settings,
  Shield,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: '指挥仪表盘', icon: LayoutDashboard },
  { id: 'cases', label: '警情研判', icon: FileText },
  { id: 'targets', label: '目标布控', icon: Target },
  { id: 'video', label: '视频实战', icon: Video },
  { id: 'analysis', label: '智能分析', icon: BrainCircuit },
];

const bottomItems = [
  { id: 'settings', label: '系统设置', icon: Settings },
];

export function Sidebar({ activeModule, onModuleChange }: SidebarProps) {
  return (
    <aside className="w-64 h-screen bg-sidebar-background border-r border-sidebar-border flex flex-col fixed left-0 top-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <Shield className="w-7 h-7 text-primary mr-3" />
        <div>
          <h1 className="text-lg font-bold text-foreground">警擎</h1>
          <p className="text-xs text-muted-foreground">智慧警务系统</p>
        </div>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-thin">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onModuleChange(item.id)}
              className={cn(
                'nav-item w-full',
                activeModule === item.id && 'active'
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Menu */}
      <div className="py-4 px-3 border-t border-sidebar-border space-y-1">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onModuleChange(item.id)}
              className={cn(
                'nav-item w-full',
                activeModule === item.id && 'active'
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button className="nav-item w-full text-destructive hover:text-destructive hover:bg-destructive/10">
          <LogOut className="w-5 h-5" />
          <span>退出登录</span>
        </button>
      </div>
    </aside>
  );
}
