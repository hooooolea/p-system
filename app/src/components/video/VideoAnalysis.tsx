import { useState } from 'react';
import { Search, Image, Video, Filter, Play, Pause, Volume2, Maximize2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Mock search results
const mockSearchResults = [
  { 
    id: 'V001', 
    type: 'video', 
    source: 'CAM001', 
    timestamp: '2024-01-15 14:30:00',
    location: '王府井大街',
    confidence: 0.94,
    thumbnail: '',
    description: '检测到目标人物出现'
  },
  { 
    id: 'V002', 
    type: 'image', 
    source: 'CAM003', 
    timestamp: '2024-01-15 14:25:00',
    location: '东单路口',
    confidence: 0.89,
    thumbnail: '',
    description: '目标车辆经过'
  },
  { 
    id: 'V003', 
    type: 'video', 
    source: 'CAM005', 
    timestamp: '2024-01-15 14:15:00',
    location: '建国门桥',
    confidence: 0.92,
    thumbnail: '',
    description: '目标与另一人员接触'
  },
];

// Mock detected objects
const mockDetectedObjects = [
  { type: '人员', count: 15, confidence: 0.95 },
  { type: '车辆', count: 8, confidence: 0.92 },
  { type: '自行车', count: 3, confidence: 0.88 },
  { type: '背包', count: 5, confidence: 0.85 },
];

export function VideoAnalysis() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [playing, setPlaying] = useState(false);

  const handleSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    setTimeout(() => {
      setSearching(false);
      setShowResults(true);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="section-title">
            <Search className="w-5 h-5 text-primary" />
            跨模态视频检索
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="输入自然语言描述，例如：穿红色外套的男子..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button 
                onClick={handleSearch} 
                disabled={searching || !query.trim()}
              >
                {searching ? '检索中...' : '检索'}
              </Button>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">筛选条件：</span>
              <Select defaultValue="all">
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="时间范围" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部时间</SelectItem>
                  <SelectItem value="1h">最近1小时</SelectItem>
                  <SelectItem value="6h">最近6小时</SelectItem>
                  <SelectItem value="24h">最近24小时</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="区域" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部区域</SelectItem>
                  <SelectItem value="dongcheng">东城区</SelectItem>
                  <SelectItem value="xicheng">西城区</SelectItem>
                  <SelectItem value="chaoyang">朝阳区</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="摄像头" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部摄像头</SelectItem>
                  <SelectItem value="cam1">CAM001-CAM100</SelectItem>
                  <SelectItem value="cam2">CAM101-CAM200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {showResults && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Player */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="section-title text-base">
                <Video className="w-4 h-4 text-primary" />
                视频回放
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video bg-secondary rounded-lg overflow-hidden">
                {/* Placeholder video */}
                <div className="absolute inset-0 bg-gradient-to-br from-secondary to-background flex items-center justify-center">
                  <Video className="w-16 h-16 text-muted-foreground/30" />
                </div>
                
                {/* Playback controls overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button 
                    variant="secondary" 
                    size="icon" 
                    className="w-14 h-14 rounded-full"
                    onClick={() => setPlaying(!playing)}
                  >
                    {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                  </Button>
                </div>
                
                {/* Bottom controls */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-white">
                      {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                      <div className="w-1/3 h-full bg-primary rounded-full" />
                    </div>
                    <span className="text-xs text-white">02:15 / 05:30</span>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-white">
                      <Volume2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-white">
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Detection overlay */}
                <div className="absolute top-3 left-3 px-2 py-1 bg-primary/80 rounded text-xs text-white">
                  检测到 3 个目标
                </div>
              </div>
              
              {/* Video info */}
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">CAM001 - 王府井大街东</p>
                  <p className="text-sm text-muted-foreground">2024-01-15 14:30:00</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <FileText className="w-4 h-4 mr-1" />
                    生成报告
                  </Button>
                  <Button variant="outline" size="sm">
                    <Maximize2 className="w-4 h-4 mr-1" />
                    全屏
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Search Results */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="section-title text-base">
                  <Filter className="w-4 h-4 text-primary" />
                  检索结果
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
                  {mockSearchResults.map((result) => (
                    <div 
                      key={result.id} 
                      className="p-3 bg-secondary/30 rounded-lg border border-border/50 hover:bg-secondary/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-12 bg-secondary rounded flex items-center justify-center flex-shrink-0">
                          {result.type === 'video' ? (
                            <Video className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <Image className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">{result.location}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-muted-foreground">{result.timestamp}</span>
                            <Badge variant="outline" className="text-xs">
                              {(result.confidence * 100).toFixed(0)}%
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Object Detection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="section-title text-base">
                  <Image className="w-4 h-4 text-primary" />
                  目标检测
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mockDetectedObjects.map((obj, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{obj.type}</Badge>
                        <span className="text-sm">{obj.count}个</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        置信度 {(obj.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
