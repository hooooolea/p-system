import { useState } from 'react';
import { Brain, Lightbulb, CheckCircle, AlertTriangle, Send, History, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// Mock chat messages
const mockChatHistory = [
  {
    id: '1',
    role: 'user',
    content: '分析一下近期盗窃案件的特点',
    timestamp: '14:30:00',
  },
  {
    id: '2',
    role: 'assistant',
    content: '根据近期数据分析，盗窃案件呈现以下特点：\n\n1. **时间特点**：多发生在下午2-4点和晚上8-10点\n2. **地点特点**：商场、超市、地铁站等人流密集区域\n3. **作案手法**：多为团伙作案，分工明确\n4. **目标选择**：主要 targeting 携带背包的单身行人\n\n建议加强上述时段和区域的巡逻力度。',
    timestamp: '14:30:05',
  },
];

// Mock suggestions
const mockSuggestions = [
  '分析今日警情趋势',
  '预测高风险区域',
  '生成巡逻建议',
  '评估布控效果',
];

// Mock decisions
const mockDecisions = [
  {
    id: 'D001',
    type: 'deployment',
    title: '增派警力部署',
    description: '建议在王府井、西单区域增派4名警力',
    reason: '根据历史数据分析，该区域今日14:00-18:00为高风险时段',
    confidence: 0.85,
    status: 'pending',
  },
  {
    id: 'D002',
    type: 'alert',
    title: '升级预警等级',
    description: '建议将火车站周边预警等级提升至二级',
    reason: '检测到可疑人员聚集，存在潜在风险',
    confidence: 0.78,
    status: 'approved',
  },
  {
    id: 'D003',
    type: 'resource',
    title: '调配监控资源',
    description: '建议临时调配2架无人机至三里屯区域',
    reason: '该区域今晚有大型活动，人流量预计增加300%',
    confidence: 0.92,
    status: 'pending',
  },
];

export function DecisionSupport() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(mockChatHistory);
  const [sending, setSending] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const newMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };
    
    setMessages([...messages, newMessage]);
    setInput('');
    setSending(true);
    
    // Simulate AI response
    setTimeout(() => {
      const aiResponse = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '已收到您的询问。根据系统分析，相关数据正在处理中。建议您关注实时预警信息，以便及时掌握最新动态。',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, aiResponse]);
      setSending(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="assistant" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto">
          <TabsTrigger value="assistant">智能助手</TabsTrigger>
          <TabsTrigger value="decisions">决策建议</TabsTrigger>
          <TabsTrigger value="history">历史记录</TabsTrigger>
        </TabsList>

        {/* AI Assistant Tab */}
        <TabsContent value="assistant">
          <Card className="h-[calc(100vh-280px)] min-h-[500px]">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="section-title">
                <Brain className="w-5 h-5 text-primary" />
                警擎智能助手
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex flex-col h-[calc(100%-65px)]">
              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={cn(
                        'flex gap-3',
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div 
                        className={cn(
                          'max-w-[70%] rounded-lg p-3',
                          msg.role === 'user' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-secondary'
                        )}
                      >
                        <p className="text-sm whitespace-pre-line">{msg.content}</p>
                        <span className="text-xs opacity-70 mt-1 block">{msg.timestamp}</span>
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium">张</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {sending && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                      <div className="bg-secondary rounded-lg p-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
                          <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              
              {/* Input Area */}
              <div className="p-4 border-t">
                {/* Quick Suggestions */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {mockSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="text-xs px-3 py-1.5 bg-secondary rounded-full hover:bg-secondary/80 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                
                <div className="flex gap-3">
                  <Input
                    placeholder="输入您的问题或需求..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    className="flex-1"
                  />
                  <Button onClick={handleSend} disabled={sending || !input.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Decisions Tab */}
        <TabsContent value="decisions">
          <div className="space-y-4">
            {mockDecisions.map((decision) => (
              <Card key={decision.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-primary" />
                        <span className="font-medium">{decision.title}</span>
                        <Badge variant="outline">
                          置信度 {(decision.confidence * 100).toFixed(0)}%
                        </Badge>
                        {decision.status === 'pending' ? (
                          <Badge className="status-warning">待处理</Badge>
                        ) : (
                          <Badge className="status-normal">已采纳</Badge>
                        )}
                      </div>
                      <p className="text-sm mt-2">{decision.description}</p>
                      <div className="flex items-start gap-2 mt-2 p-2 bg-secondary/50 rounded">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-muted-foreground">{decision.reason}</p>
                      </div>
                    </div>
                    {decision.status === 'pending' && (
                      <div className="flex gap-2 ml-4">
                        <Button variant="outline" size="sm">
                          忽略
                        </Button>
                        <Button size="sm">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          采纳
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="section-title text-base">
                <History className="w-4 h-4 text-primary" />
                决策历史
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { action: '采纳建议', content: '增派警力至天安门区域', time: '2024-01-15 12:30:00', user: '张警官' },
                  { action: '生成报告', content: '本周警情分析报告', time: '2024-01-15 10:15:00', user: '张警官' },
                  { action: '更新布控', content: '修改目标李某布控等级', time: '2024-01-15 09:00:00', user: '系统' },
                  { action: '采纳建议', content: '升级北京西站预警等级', time: '2024-01-14 16:45:00', user: '李警官' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-secondary/30 rounded-lg">
                    <div className="w-2 h-2 bg-primary rounded-full" />
                    <div className="flex-1">
                      <span className="font-medium">{item.action}</span>
                      <span className="text-muted-foreground mx-2">-</span>
                      <span>{item.content}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span>{item.time}</span>
                      <span className="mx-2">|</span>
                      <span>{item.user}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
