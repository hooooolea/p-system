import { Target, MapPin, Clock, User, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TargetItem } from '@/types';
import { riskLevelMap, statusMap } from '@/data/mock';

interface TargetListProps {
  targets: TargetItem[];
  onViewAll?: () => void;
}

const targetTypeConfig = {
  person: { icon: User, label: '人员' },
  vehicle: { icon: Car, label: '车辆' },
  object: { icon: Target, label: '物品' },
};

export function TargetList({ targets, onViewAll }: TargetListProps) {
  return (
    <div className="police-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">
          <Target className="w-5 h-5 text-primary" />
          布控目标
        </h3>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          查看全部
        </Button>
      </div>

      <div className="space-y-3">
        {targets.map((target) => {
          const riskConfig = riskLevelMap[target.riskLevel];
          const statusConfig = statusMap[target.status];
          const typeConfig = targetTypeConfig[target.type];
          const Icon = typeConfig.icon;
          
          return (
            <div 
              key={target.id} 
              className="p-3 bg-secondary/30 rounded-lg border border-border/50 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{target.name}</span>
                    <span className="status-badge text-xs status-info">
                      {typeConfig.label}
                    </span>
                    <span className={cn('status-badge text-xs', riskConfig.class)}>
                      {riskConfig.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {target.features.slice(0, 3).map((feature, idx) => (
                      <span 
                        key={idx} 
                        className="text-xs px-2 py-0.5 bg-secondary rounded text-muted-foreground"
                      >
                        {feature}
                      </span>
                    ))}
                    {target.features.length > 3 && (
                      <span className="text-xs px-2 py-0.5 bg-secondary rounded text-muted-foreground">
                        +{target.features.length - 3}
                      </span>
                    )}
                  </div>
                  {target.lastSeen && (
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {target.lastLocation}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {target.lastSeen}
                      </span>
                    </div>
                  )}
                </div>
                <span className={cn('status-badge text-xs', statusConfig.class)}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
