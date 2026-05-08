import { AlertTriangle, Bell, Info, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AlertItem } from '@/types';
import { statusMap } from '@/data/mock';

interface AlertListProps {
  alerts: AlertItem[];
  onViewAll?: () => void;
}

const alertTypeConfig = {
  critical: { 
    icon: AlertTriangle, 
    class: 'status-critical',
    label: '紧急' 
  },
  warning: { 
    icon: Bell, 
    class: 'status-warning',
    label: '警告' 
  },
  info: { 
    icon: Info, 
    class: 'status-info',
    label: '提示' 
  },
  normal: { 
    icon: CheckCircle, 
    class: 'status-normal',
    label: '正常' 
  },
};

export function AlertList({ alerts, onViewAll }: AlertListProps) {
  return (
    <div className="police-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">
          <Bell className="w-5 h-5 text-primary" />
          实时预警
        </h3>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          查看全部
        </Button>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => {
          const config = alertTypeConfig[alert.type];
          const Icon = config.icon;
          const statusConfig = statusMap[alert.status];
          
          return (
            <div 
              key={alert.id} 
              className="p-3 bg-secondary/30 rounded-lg border border-border/50 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={cn('p-2 rounded-md', config.class)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{alert.title}</span>
                    <span className={cn('status-badge text-xs', config.class)}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {alert.description}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{alert.location}</span>
                      <span>{alert.timestamp}</span>
                    </div>
                    <span className={cn('status-badge text-xs', statusConfig.class)}>
                      {statusConfig.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
