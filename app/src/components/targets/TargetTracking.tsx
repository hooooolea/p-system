import { useState } from 'react';
import { Search, MapPin, Clock, Camera, Route, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// Mock trajectory data
const mockTrajectory = [
  { time: '14:32:18', location: '王府井大街', camera: 'CAM001', confidence: 0.95 },
  { time: '14:28:05', location: '东单路口', camera: 'CAM003', confidence: 0.92 },
  { time: '14:15:30', location: '建国门桥', camera: 'CAM005', confidence: 0.88 },
  { time: '13:58:12', location: '北京站', camera: 'CAM007', confidence: 0.91 },
  { time: '13:45:22', location: '北京西站', camera: 'CAM009', confidence: 0.97 },
];

// Mock similar targets
const mockSimilarTargets = [
  { id: 'S001', similarity: 0.92, location: '西单大悦城', time: '14:20:00', features: ['红色外套', '黑色背包'] },
  { id: 'S002', similarity: 0.87, location: '国贸商城', time: '13:50:00', features: ['相似体型', '短发'] },
  { id: 'S003', similarity: 0.83, location: '三里屯', time: '13:30:00', features: ['黑色裤子', '运动鞋'] },
];

export function TargetTracking() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setTimeout(() => {
      setSearching(false);
      setShowResults(true);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="section-title">
            <Search className="w-5 h-5 text-primary" />
            目标特征溯源
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="输入目标特征描述，例如：男，30岁，身高175cm，穿黑色外套..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button 
                onClick={handleSearch} 
                disabled={searching || !searchQuery.trim()}
              >
                {searching ? '检索中...' : '开始溯源'}
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">快速筛选：</span>
              {['人员', '车辆', '物品'].map((type) => (
                <Badge key={type} variant="outline" className="cursor-pointer hover:bg-secondary">
                  {type}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {showResults && (
        <Tabs defaultValue="trajectory" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto">
            <TabsTrigger value="trajectory">行动轨迹</TabsTrigger>
            <TabsTrigger value="similar">相似目标</TabsTrigger>
            <TabsTrigger value="prediction">行为预测</TabsTrigger>
          </TabsList>

          {/* Trajectory Tab */}
          <TabsContent value="trajectory">
            <Card>
              <CardHeader>
                <CardTitle className="section-title text-base">
                  <Route className="w-4 h-4 text-primary" />
                  目标行动轨迹
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {/* Timeline */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                  
                  <div className="space-y-4">
                    {mockTrajectory.map((point, idx) => (
                      <div key={idx} className="relative pl-10">
                        {/* Timeline dot */}
                        <div className={cn(
                          'absolute left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center',
                          idx === 0 ? 'bg-primary border-primary' : 'bg-background border-border'
                        )}>
                          <div className={cn(
                            'w-2 h-2 rounded-full',
                            idx === 0 ? 'bg-white' : 'bg-muted-foreground'
                          )} />
                        </div>
                        
                        <div className="p-3 bg-secondary/30 rounded-lg border border-border/50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <span className="font-medium">{point.location}</span>
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {point.time}
                              </span>
                            </div>
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Camera className="w-3 h-3" />
                              {point.camera}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">匹配度：</span>
                            <div className="flex-1 max-w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${point.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">{(point.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Similar Targets Tab */}
          <TabsContent value="similar">
            <Card>
              <CardHeader>
                <CardTitle className="section-title text-base">
                  <AlertTriangle className="w-4 h-4 text-primary" />
                  相似目标识别
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockSimilarTargets.map((target) => (
                    <div 
                      key={target.id} 
                      className="p-4 bg-secondary/30 rounded-lg border border-border/50 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{target.id}</span>
                            <Badge className={cn(
                              target.similarity >= 0.9 ? 'status-critical' :
                              target.similarity >= 0.8 ? 'status-warning' : 'status-info'
                            )}>
                              相似度 {(target.similarity * 100).toFixed(0)}%
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {target.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {target.time}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {target.features.map((feature, idx) => (
                              <span 
                                key={idx} 
                                className="text-xs px-2 py-0.5 bg-secondary rounded text-muted-foreground"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm">
                          查看详情
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prediction Tab */}
          <TabsContent value="prediction">
            <Card>
              <CardHeader>
                <CardTitle className="section-title text-base">
                  <Route className="w-4 h-4 text-primary" />
                  行为预测分析
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-secondary/30 rounded-lg">
                    <h4 className="font-medium mb-2">预测目的地</h4>
                    <div className="space-y-2">
                      {[
                        { location: '北京南站', probability: 0.45, reason: '轨迹方向指向' },
                        { location: '首都机场', probability: 0.30, reason: '时间规律分析' },
                        { location: '六里桥客运站', probability: 0.25, reason: '历史数据匹配' },
                      ].map((pred, idx) => (
                        <div key={idx} className="flex items-center gap-4">
                          <span className="w-24 text-sm">{pred.location}</span>
                          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${pred.probability * 100}%` }}
                            />
                          </div>
                          <span className="w-12 text-sm text-right">{(pred.probability * 100).toFixed(0)}%</span>
                          <span className="text-xs text-muted-foreground">{pred.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-400">预警提示</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          根据目标行动轨迹和行为模式分析，该目标可能在30分钟内前往交通枢纽区域，
                          建议提前部署警力进行布控。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
