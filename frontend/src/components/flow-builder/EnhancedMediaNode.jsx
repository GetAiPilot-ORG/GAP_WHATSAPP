import BaseNode from './BaseNode';
import { Image, Video, Music, FileText, ExternalLink, Globe } from 'lucide-react';
import { normalizeMediaUrl } from '../../utils/mediaUrlHelper';

export default function EnhancedMediaNode({ id, data, selected }) {
    const config = data?.config || {};
    const mediaType = data?.mediaType || 'image';
    const previewUrl = normalizeMediaUrl(config.url, mediaType);

    const icons = {
        image: Image,
        video: Video,
        audio: Music,
        file: FileText
    };

    const colors = {
        image: 'purple',
        video: 'pink',
        audio: 'green',
        file: 'indigo'
    };

    const Icon = icons[mediaType];
    const hasButton = (mediaType === 'image' || mediaType === 'video') && (config.buttonText || config.buttonUrl);

    return (
        <BaseNode
            id={id}
            data={data}
            icon={Icon}
            title={mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}
            color={colors[mediaType]}
            selected={selected}
        >
            <div className="space-y-2">
                {/* Media Content / Thumbnail */}
                {config.uploadMethod === 'custom' ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Custom Field:</span>
                        <div className="font-mono text-[11px] bg-purple-50 px-2 py-1 rounded mt-1 border border-purple-100 truncate">
                            {config.customField || 'Not configured'}
                        </div>
                    </div>
                ) : config.url ? (
                    <div className="space-y-1">
                        {mediaType === 'image' && (
                            <div className="w-full h-24 bg-gray-100 rounded border border-gray-200 overflow-hidden flex items-center justify-center relative">
                                <img
                                    src={previewUrl}
                                    alt="Media preview"
                                    referrerPolicy="no-referrer"
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <div className="hidden absolute inset-0 items-center justify-center text-gray-400 text-xs">
                                    <Image className="h-6 w-6 opacity-40 mr-1" />
                                    <span>Image</span>
                                </div>
                            </div>
                        )}
                        {mediaType === 'video' && (
                            <div className="w-full h-28 bg-gray-900 rounded border border-gray-200 overflow-hidden flex items-center justify-center relative">
                                <video
                                    src={previewUrl}
                                    controls
                                    preload="metadata"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                                <div className="hidden absolute inset-0 items-center justify-center text-gray-400 text-xs bg-gray-900">
                                    <Video className="h-6 w-6 opacity-60 mr-1 text-white" />
                                    <span className="text-gray-300">Video</span>
                                </div>
                            </div>
                        )}
                        <div className="text-xs">
                            <span className="text-gray-500">URL:</span>
                            <div className="font-mono text-[10px] bg-gray-50 px-2 py-1 rounded mt-0.5 truncate border border-gray-100">
                                {config.url}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic py-1">
                        Click to configure {mediaType}
                    </div>
                )}

                {/* Caption */}
                {config.caption && (
                    <div className="text-xs text-gray-700 bg-gray-50/80 p-1.5 rounded border border-gray-100 line-clamp-2">
                        "{config.caption}"
                    </div>
                )}

                {/* WhatsApp Interactive Button - Identical to Button Node friendly styling */}
                {hasButton && (
                    <div className="pt-1">
                        <div className="bg-green-50/90 border border-green-200 rounded px-2.5 py-1.5 shadow-2xs hover:bg-green-100/60 transition-colors">
                            <div className="flex items-center justify-between gap-1">
                                <div className="text-xs font-semibold text-green-900 truncate flex items-center gap-1.5">
                                    <Globe className="h-3 w-3 text-green-700 shrink-0" />
                                    <span className="truncate">{config.buttonText || 'Visit Website'}</span>
                                </div>
                                <span className="text-[9px] uppercase font-bold text-green-700 bg-green-200/60 px-1.5 py-0.5 rounded shrink-0">
                                    CTA URL
                                </span>
                            </div>
                            <div className="text-[10px] text-green-700 font-mono flex items-center gap-1 mt-0.5 truncate">
                                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{config.buttonUrl || 'https://...'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
