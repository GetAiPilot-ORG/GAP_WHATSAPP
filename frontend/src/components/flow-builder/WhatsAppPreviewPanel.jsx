import { X, ArrowLeft } from 'lucide-react';
import React from 'react';
import { normalizeMediaUrl } from '../../utils/mediaUrlHelper';

// Common doodle background for WhatsApp
const whatsappDoodleUrl = 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png';

export default function WhatsAppPreviewPanel({ node, onClose, phoneNumber, isConfigOpen }) {
    if (!node) return null;

    // Helper to extract text from different node types
    const renderContent = () => {
        const { type, data } = node;
        const config = data?.config || {};
        
        let messageText = '';
        let buttons = [];
        let header = '';
        let footer = '';
        let mediaUrl = '';
        const mediaType = data?.mediaType || type;

        if (type === 'startBotFlow') {
            messageText = 'Start Bot Flow\nKeywords: ' + (config.keywords || '');
        } else if (type === 'textMessage' || type === 'text') {
            messageText = config.message || config.text || '(Empty message)';
        } else if (type === 'userInput') {
            messageText = config.question || '(Empty question)';
        } else if (type === 'handoff') {
            messageText = config.message || 'Connecting you to an agent...';
        } else if (type === 'button' || type === 'enhancedButton') {
            messageText = config.message || config.body || config.text || '(Empty message)';
            header = config.headerText || config.header || '';
            footer = config.footerText || config.footer || '';
            buttons = config.buttons || [];
        } else if (type === 'image' || type === 'media' || type === 'video' || type === 'audio' || type === 'file' || data?.mediaType) {
            mediaUrl = normalizeMediaUrl(config.url || '', mediaType);
            messageText = config.caption || '';
            if (config.buttonText || config.buttonUrl) {
                buttons = [{
                    text: config.buttonText || 'Visit Website',
                    url: config.buttonUrl,
                    type: 'url'
                }];
            }
        } else if (type === 'templateMessage' || type === 'template') {
            messageText = config.templateName || config.template?.name ? `Template: ${config.templateName || config.template?.name}` : 'Select a template';
        } else if (config.message || config.text || config.body) {
            messageText = config.message || config.text || config.body;
        } else if (data?.text || data?.body) {
            messageText = data.text || data.body;
        } else {
            messageText = 'Preview not available for this node type.';
        }

        return (
            <div className="flex flex-col gap-1 w-full max-w-[85%]">
                <div className="bg-white rounded-lg rounded-tl-none p-2.5 shadow-sm text-[15px] text-[#111b21] leading-relaxed relative">
                    {header && <div className="font-bold mb-1">{header}</div>}
                    {mediaUrl && (
                        <div className="mb-2 rounded overflow-hidden max-h-48 bg-gray-100 flex items-center justify-center">
                            {mediaType === 'image' ? (
                                <img
                                    src={mediaUrl}
                                    alt="preview"
                                    referrerPolicy="no-referrer"
                                    loading="lazy"
                                    className="w-full h-auto object-cover"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                                    }}
                                />
                            ) : mediaType === 'video' ? (
                                <video
                                    src={mediaUrl}
                                    controls
                                    preload="metadata"
                                    className="w-full h-auto max-h-48 object-cover"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                                    }}
                                />
                            ) : (
                                <div className="p-4 text-xs text-gray-500">[{mediaType} file]</div>
                            )}
                            <div className="hidden p-4 text-xs text-gray-400 italic text-center">
                                [{mediaType || 'Media'} unavailable]
                            </div>
                        </div>
                    )}
                    {messageText && <div className="whitespace-pre-wrap break-words">{messageText}</div>}
                    {footer && <div className="text-[13px] text-gray-500 mt-1">{footer}</div>}
                    <div className="text-[11px] text-gray-400 text-right mt-1.5 float-right ml-3">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
                {buttons.length > 0 && (
                    <div className="flex flex-col gap-1 mt-1">
                        {buttons.map((btn, idx) => (
                            <div key={idx} className="bg-white rounded-lg shadow-sm text-center py-2.5 px-4 text-[#00a884] text-[15px] font-medium cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                                {(btn.type === 'url' || btn.url) && <span>🔗</span>}
                                <span>{btn.text || btn.title || btn.label || `Button ${idx + 1}`}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`absolute top-1/2 -translate-y-1/2 h-[600px] w-[340px] bg-[#efeae2] border border-gray-200 rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex flex-col z-[100] transform transition-all duration-300 ${isConfigOpen ? 'right-[440px]' : 'right-10'}`}>
            {/* Header */}
            <div className="bg-[#008069] text-white flex items-center px-3 py-2 shrink-0">
                <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors mr-1">
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                        </svg>
                    </div>
                    <div className="truncate font-semibold text-[15px]">
                        {phoneNumber || 'Customer'}
                    </div>
                </div>
            </div>

            {/* Chat Body */}
            <div 
                className="flex-1 overflow-y-auto p-4 flex flex-col"
                style={{ 
                    backgroundImage: `url(${whatsappDoodleUrl})`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '400px',
                    opacity: 0.95
                }}
            >
                {/* Simulated Chat Message */}
                <div className="flex mb-4">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
