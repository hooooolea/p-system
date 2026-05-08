import { Video, MapPin, Eye, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoItem } from '@/types';

interface VideoPreviewProps {
  videos: VideoItem[];
  onViewAll?: () => void;
}

export function VideoPreview({ videos, onViewAll }: VideoPreviewProps) {
  return (
    <div className="police-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">
          <Video className="w-5 h-5 text-primary" />
          实时监控
        </h3>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          查看全部
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {videos.slice(0, 4).map((video) => (
          <div 
            key={video.id} 
            className="group relative aspect-video bg-secondary rounded-lg overflow-hidden border border-border/50"
          >
            {/* Placeholder for video feed */}
            <div className="absolute inset-0 bg-gradient-to-br from-secondary to-background flex items-center justify-center">
              <Video className="w-8 h-8 text-muted-foreground/50" />
            </div>
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button variant="secondary" size="icon" className="w-8 h-8">
                <Eye className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="icon" className="w-8 h-8">
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Info Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-between text-xs text-white">
                <span className="font-medium">{video.cameraName}</span>
                <span className="text-white/70">{video.timestamp.split(' ')[1]}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-white/70 mt-0.5">
                <MapPin className="w-3 h-3" />
                <span>{video.location}</span>
              </div>
            </div>
            
            {/* Live Indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-white font-medium">LIVE</span>
            </div>
            
            {/* Detection Count */}
            {video.detectedObjects.length > 0 && (
              <div className="absolute top-2 right-2 px-2 py-0.5 bg-primary/80 rounded text-xs text-white">
                {video.detectedObjects.length} 个目标
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
