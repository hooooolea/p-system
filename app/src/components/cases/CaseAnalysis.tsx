import { useState } from 'react';
import { Brain, MessageSquare, AlertCircle, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { mockSemanticAnalysis } from '@/data/mock';

export function CaseAnalysis() {
  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<typeof mockSemanticAnalysis | null>(null);

  const handleAnalyze = () => {
    if (!input.trim()) return;
    setAnalyzing(true);
    // Simulate analysis
    setTimeout(() => {
      setResult(mockSemanticAnalysis);
      setAnalyzing(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="section-title">
            <Brain className="w-5 h-5 text-primary" />
            警情语义分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="输入警情描述，例如：有人在我家门口吵闹，还砸东西..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              />
              <Button 
                onClick={handleAnalyze} 
                disabled={analyzing || !input.trim()}
              >
                {analyzing ? '分析中...' : '开始分析'}
              </Button>
            </div>
            
            {/* Quick Examples */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">示例：</span>
              {[
                '小区里有人打架',
                '发现可疑人员徘徊',
                '车辆被盗',
                '老人走失',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setInput(example)}
                  className="text-sm text-primary hover:underline"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Result */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Semantic Understanding */}
          <Card>
            <CardHeader>
              <CardTitle className="section-title text-base">
                <MessageSquare className="w-4 h-4 text-primary" />
                语义理解
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">原始文本</label>
                <p className="mt-1 p-3 bg-secondary/50 rounded text-sm">{result.originalText}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">标准化表述</label>
                <p className="mt-1 p-3 bg-primary/10 rounded text-sm border border-primary/20">
                  {result.normalizedText}
                </p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">意图识别</label>
                <div className="mt-1">
                  <Badge variant="secondary">{result.intent}</Badge>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">实体提取</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {result.entities.map((entity, idx) => (
                    <Badge key={idx} variant="outline" className="flex items-center gap-1">
                      <span className="text-muted-foreground">{entity.type}:</span>
                      <span>{entity.value}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk Assessment */}
          <Card>
            <CardHeader>
              <CardTitle className="section-title text-base">
                <AlertCircle className="w-4 h-4 text-primary" />
                风险评估
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm text-muted-foreground">风险等级</label>
                  <div className="mt-1">
                    <Badge 
                      className={cn(
                        'text-sm px-3 py-1',
                        result.riskAssessment.level === 'high' && 'status-critical',
                        result.riskAssessment.level === 'medium' && 'status-warning',
                        result.riskAssessment.level === 'low' && 'status-normal',
                      )}
                    >
                      {result.riskAssessment.level === 'high' && '高风险'}
                      {result.riskAssessment.level === 'medium' && '中风险'}
                      {result.riskAssessment.level === 'low' && '低风险'}
                    </Badge>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-sm text-muted-foreground">风险评分</label>
                  <div className="mt-1">
                    <span className={cn(
                      'text-2xl font-bold',
                      result.riskAssessment.score >= 70 && 'text-destructive',
                      result.riskAssessment.score >= 40 && result.riskAssessment.score < 70 && 'text-amber-400',
                      result.riskAssessment.score < 40 && 'text-emerald-400',
                    )}>
                      {result.riskAssessment.score}
                    </span>
                    <span className="text-muted-foreground">/100</span>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground">风险因子</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {result.riskAssessment.factors.map((factor, idx) => (
                    <Badge key={idx} variant="secondary" className="status-warning">
                      {factor}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground">处置建议</label>
                <div className="mt-1 p-3 bg-secondary/50 rounded flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{result.riskAssessment.suggestion}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
