import { FileText, MapPin, User, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { CaseItem } from '@/types';
import { riskLevelMap, statusMap, caseTypeMap } from '@/data/mock';

interface CaseListProps {
  cases: CaseItem[];
  onViewAll?: () => void;
}

export function CaseList({ cases, onViewAll }: CaseListProps) {
  return (
    <div className="police-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">
          <FileText className="w-5 h-5 text-primary" />
          最新警情
        </h3>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          查看全部
        </Button>
      </div>

      <div className="space-y-3">
        {cases.map((caseItem) => {
          const riskConfig = riskLevelMap[caseItem.riskLevel];
          const statusConfig = statusMap[caseItem.status];
          const typeClass = caseTypeMap[caseItem.type as keyof typeof caseTypeMap] || 'status-info';
          
          return (
            <div 
              key={caseItem.id} 
              className="p-3 bg-secondary/30 rounded-lg border border-border/50 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{caseItem.caseNo}</span>
                    <span className={cn('status-badge text-xs', typeClass)}>
                      {caseItem.type}
                    </span>
                    <span className={cn('status-badge text-xs', riskConfig.class)}>
                      {riskConfig.label}
                    </span>
                  </div>
                  <p className="text-sm mt-1 truncate">{caseItem.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {caseItem.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {caseItem.createTime}
                    </span>
                    {caseItem.assignee && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {caseItem.assignee}
                      </span>
                    )}
                  </div>
                </div>
                <span className={cn('status-badge text-xs ml-2', statusConfig.class)}>
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
