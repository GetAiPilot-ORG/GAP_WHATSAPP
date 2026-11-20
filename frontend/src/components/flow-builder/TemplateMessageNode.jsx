import BaseNode from './BaseNode';
import { FileText } from 'lucide-react';

export default function TemplateMessageNode({ id, data, selected }) {
    const config = data?.config || {};

    const templateLabel = config.templateName || config.template || 'Select template';
    const templateSource = config.templateSource || 'whatsapp';

    return (
        <BaseNode
            id={id}
            data={data}
            icon={FileText}
            title="Template Message"
            color="indigo"
            selected={selected}
        >
            <div className="space-y-2">
                <div className="text-xs">
                    <span className="text-gray-500">Source:</span>
                    <div className="font-medium text-indigo-800 mt-1">
                        {templateSource === 'flow' ? 'Flow Template' : 'WhatsApp Template'}
                    </div>
                </div>

                {templateLabel && (
                    <div className="text-xs">
                        <span className="text-gray-500">{templateSource === 'flow' ? 'Target Flow:' : 'Template:'}</span>
                        <div className="font-medium text-indigo-800 mt-1">
                            {templateLabel}
                        </div>
                    </div>
                )}

                {templateSource === 'flow' && config.triggerKeyword && (
                    <div className="text-xs">
                        <span className="text-gray-500">Trigger:</span>
                        <div className="font-mono text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded mt-1 border border-emerald-200">
                            {config.triggerKeyword}
                        </div>
                    </div>
                )}

                {config.language && (
                    <div className="text-[10px] text-gray-500">
                        🌐 {config.language}
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
