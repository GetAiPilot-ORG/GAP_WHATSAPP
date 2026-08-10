import { X, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FLOW_TEMPLATES } from './flowTemplates';
import { notify } from '../../services/notificationService';

export default function NodeConfigPanel({ node, onClose, onSave }) {
    const [config, setConfig] = useState(node?.data?.config || {});

    useEffect(() => {
        setConfig(node?.data?.config || {});
    }, [node]);

    if (!node) return null;

    const handleSave = () => {
        onSave(node.id, config);
        onClose();
    };

    const updateConfig = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="absolute right-6 top-6 bottom-6 w-[400px] bg-white shadow-2xl z-50 flex flex-col rounded-2xl overflow-hidden animate-slide-in-right">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Configure {node.type}</h2>
                        <p className="text-xs text-blue-100 mt-0.5">Node ID: {node.id}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {renderConfigForm(node.type, config, updateConfig)}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        <Save className="h-4 w-4" />
                        Save
                    </button>
                </div>
            </div>
        </>
    );
}

function renderConfigForm(nodeType, config, updateConfig) {
    switch (nodeType) {
        case 'startBotFlow':
            return <StartBotFlowConfig config={config} updateConfig={updateConfig} />;
        case 'textMessage':
            return <TextMessageConfig config={config} updateConfig={updateConfig} />;
        case 'image':
        case 'audio':
        case 'video':
        case 'file':
            return <MediaConfig config={config} updateConfig={updateConfig} nodeType={nodeType} />;
        case 'userInput':
            return <UserInputConfig config={config} updateConfig={updateConfig} />;
        case 'condition':
            return <ConditionConfig config={config} updateConfig={updateConfig} />;
        case 'button':
            return <ButtonConfig config={config} updateConfig={updateConfig} />;
        case 'location':
            return <LocationConfig config={config} updateConfig={updateConfig} />;
        case 'httpApi':
            return <HTTPAPIConfig config={config} updateConfig={updateConfig} />;
        case 'ai':
            return <AIConfig config={config} updateConfig={updateConfig} />;
        case 'googleSheets':
            return <GoogleSheetsConfig config={config} updateConfig={updateConfig} />;
        case 'whatsappFlow':
            return <WhatsAppFlowConfig config={config} updateConfig={updateConfig} />;
        case 'appointment':
            return <AppointmentConfig config={config} updateConfig={updateConfig} />;
        case 'product':
            return <ProductConfig config={config} updateConfig={updateConfig} />;
        case 'template':
            return <TemplateConfig config={config} updateConfig={updateConfig} />;
        case 'interactive':
            return <InteractiveListConfig config={config} updateConfig={updateConfig} />;
        case 'handoff':
            return <HandoffConfig config={config} updateConfig={updateConfig} />;
        case 'end':
            return <EndConfig config={config} updateConfig={updateConfig} />;
        default:
            return <DefaultConfig config={config} updateConfig={updateConfig} />;
    }
}

// Configuration components for each node type
function StartBotFlowConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Trigger Keywords
                </label>
                <input
                    type="text"
                    value={config.keywords || ''}
                    onChange={(e) => updateConfig('keywords', e.target.value)}
                    placeholder="Hello, Hi, Start"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Comma-separated keywords</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Match Type
                </label>
                <div className="flex gap-3">
                    <button
                        onClick={() => updateConfig('matchType', 'exact')}
                        className={`flex-1 px-4 py-2 rounded-lg border ${config.matchType === 'exact'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300'
                            }`}
                    >
                        Exact Match
                    </button>
                    <button
                        onClick={() => updateConfig('matchType', 'string')}
                        className={`flex-1 px-4 py-2 rounded-lg border ${config.matchType === 'string'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300'
                            }`}
                    >
                        String Match
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title
                </label>
                <input
                    type="text"
                    value={config.title || ''}
                    onChange={(e) => updateConfig('title', e.target.value)}
                    placeholder="Welcome Flow"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add Labels
                </label>
                <input
                    type="text"
                    value={config.labels || ''}
                    onChange={(e) => updateConfig('labels', e.target.value)}
                    placeholder="new-user, welcome"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>
    );
}

function TextMessageConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message Text
                </label>
                <textarea
                    value={config.message || ''}
                    onChange={(e) => updateConfig('message', e.target.value)}
                    placeholder="Enter your message here..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 nodrag"
                    rows={6}
                    maxLength={4096}
                />
                <p className="mt-1 text-xs text-gray-500">
                    {(config.message || '').length}/4096 characters
                </p>
            </div>

            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                    Typing on Display
                </label>
                <button
                    onClick={() => updateConfig('typingDisplay', !config.typingDisplay)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.typingDisplay ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.typingDisplay ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
            </div>

            <SmartDelayConfig config={config} updateConfig={updateConfig} />
        </div>
    );
}

function HandoffConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Handoff Reason</label>
                <input
                    type="text"
                    value={config.reason || ''}
                    onChange={(e) => updateConfig('reason', e.target.value)}
                    placeholder="Customer needs a sales agent"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message Before Handoff</label>
                <textarea
                    value={config.message || ''}
                    onChange={(e) => updateConfig('message', e.target.value)}
                    placeholder="Thanks. I am connecting you with a sales agent."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                    type="checkbox"
                    checked={config.disableBotAfterHandoff !== false}
                    onChange={(e) => updateConfig('disableBotAfterHandoff', e.target.checked)}
                />
                Disable bot after handoff
            </label>
        </div>
    );
}

function EndConfig({ config, updateConfig }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Final Message</label>
            <textarea
                value={config.message || ''}
                onChange={(e) => updateConfig('message', e.target.value)}
                placeholder="Optional message before ending the flow"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
            />
        </div>
    );
}

function MediaConfig({ config, updateConfig, nodeType }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Method
                </label>
                <div className="flex gap-3">
                    <button
                        onClick={() => updateConfig('uploadMethod', 'custom')}
                        className={`flex-1 px-4 py-2 rounded-lg border text-sm ${config.uploadMethod === 'custom'
                            ? 'bg-purple-500 text-white border-purple-500'
                            : 'bg-white text-gray-700 border-gray-300'
                            }`}
                    >
                        Custom Field
                    </button>
                    <button
                        onClick={() => updateConfig('uploadMethod', 'upload')}
                        className={`flex-1 px-4 py-2 rounded-lg border text-sm ${config.uploadMethod === 'upload'
                            ? 'bg-purple-500 text-white border-purple-500'
                            : 'bg-white text-gray-700 border-gray-300'
                            }`}
                    >
                        Upload New
                    </button>
                </div>
            </div>

            {config.uploadMethod === 'custom' ? (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Custom Field URL
                    </label>
                    <input
                        type="text"
                        value={config.customField || ''}
                        onChange={(e) => updateConfig('customField', e.target.value)}
                        placeholder="{{imageUrl}}"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                </div>
            ) : (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        {nodeType === 'image' ? 'Image URL' :
                            nodeType === 'audio' ? 'Audio URL' :
                                nodeType === 'video' ? 'Video URL' : 'File URL'}
                    </label>
                    <input
                        type="url"
                        value={config.url || ''}
                        onChange={(e) => updateConfig('url', e.target.value)}
                        placeholder="https://example.com/media.jpg"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                </div>
            )}

            {(nodeType === 'image' || nodeType === 'video') && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Caption
                    </label>
                    <textarea
                        value={config.caption || ''}
                        onChange={(e) => updateConfig('caption', e.target.value)}
                        placeholder="Enter caption..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        rows={3}
                    />
                </div>
            )}

            <SmartDelayConfig config={config} updateConfig={updateConfig} />
        </div>
    );
}

function UserInputConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prompt Message (Optional)
                </label>
                <textarea
                    value={config.question || ''}
                    onChange={(e) => updateConfig('question', e.target.value)}
                    placeholder="Leave empty if the previous Text Message already asks the question"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Input Type
                </label>
                <select
                    value={config.inputType || 'text'}
                    onChange={(e) => updateConfig('inputType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Save to Custom Field
                </label>
                <input
                    type="text"
                    value={config.saveToField || ''}
                    onChange={(e) => {
                        const cleaned = e.target.value
                            .replace(/^\{\{\s*/, '')
                            .replace(/\s*\}\}$/, '')
                            .replace(/[^a-zA-Z0-9_]/g, '_')
                            .toLowerCase();
                        updateConfig('saveToField', cleaned);
                    }}
                    placeholder="name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Use a simple key like <span className="font-mono">name</span>. Later messages can use <span className="font-mono">{'{{name}}'}</span>.</p>
            </div>
        </div>
    );
}

function ConditionConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Variable
                </label>
                <input
                    type="text"
                    value={config.variable || ''}
                    onChange={(e) => updateConfig('variable', e.target.value)}
                    placeholder="{{response}}"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Operator
                </label>
                <select
                    value={config.operator || 'equals'}
                    onChange={(e) => updateConfig('operator', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                    <option value="equals">Equals</option>
                    <option value="notEquals">Not Equals</option>
                    <option value="contains">Contains</option>
                    <option value="greaterThan">Greater Than</option>
                    <option value="lessThan">Less Than</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Value
                </label>
                <input
                    type="text"
                    value={config.value || ''}
                    onChange={(e) => updateConfig('value', e.target.value)}
                    placeholder="yes"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
            </div>
        </div>
    );
}

function ButtonConfig({ config, updateConfig }) {
    const buttons = config.buttons || [
        { text: '', type: 'reply', url: '' },
        { text: '', type: 'reply', url: '' },
        { text: '', type: 'reply', url: '' }
    ];

    const updateButton = (index, field, value) => {
        const newButtons = [...buttons];
        newButtons[index] = { ...newButtons[index], [field]: value };
        updateConfig('buttons', newButtons);
    };

    const addButton = () => {
        if (buttons.length < 3) {
            updateConfig('buttons', [...buttons, { text: '', type: 'reply', url: '' }]);
        }
    };

    const removeButton = (index) => {
        updateConfig('buttons', buttons.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Header Message</label>
                <textarea
                    value={config.headerText || ''}
                    onChange={(e) => updateConfig('headerText', e.target.value)}
                    placeholder="Message shown above buttons..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    rows={3}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Footer Text (Optional)</label>
                <input
                    type="text"
                    value={config.footerText || ''}
                    onChange={(e) => updateConfig('footerText', e.target.value)}
                    placeholder="Footer message..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
            </div>

            <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Buttons (max 3)</label>
                {buttons.map((button, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg border space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-gray-600">Button {index + 1}</label>
                            {buttons.length > 1 && (
                                <button onClick={() => removeButton(index)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                            )}
                        </div>

                        <input
                            type="text"
                            value={button.text}
                            onChange={(e) => updateButton(index, 'text', e.target.value)}
                            placeholder="Button label (max 20 chars)"
                            maxLength={20}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />

                        <select
                            value={button.type || 'reply'}
                            onChange={(e) => updateButton(index, 'type', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        >
                            <option value="reply">Quick Reply (next node se link hoga)</option>
                            <option value="url">URL Open karo</option>
                            <option value="form">Open Form (GetAiPilot)</option>
                            <option value="phone">Phone Call</option>
                        </select>

                        {(button.type === 'url' || button.type === 'form') && (
                            <input
                                type="url"
                                value={button.url || ''}
                                onChange={(e) => updateButton(index, 'url', e.target.value)}
                                placeholder={button.type === 'form' ? "Paste Form URL (https://getaipilot.in/f/...)" : "https://..."}
                                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                            />
                        )}
                        {button.type === 'phone' && (
                            <input
                                type="text"
                                value={button.phone || ''}
                                onChange={(e) => updateButton(index, 'phone', e.target.value)}
                                placeholder="+91XXXXXXXXXX"
                                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                            />
                        )}
                        {button.type === 'reply' && (
                            <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                Flow editor mein is button se next node connect karo
                            </p>
                        )}
                    </div>
                ))}

                {buttons.length < 3 && (
                    <button
                        onClick={addButton}
                        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600"
                    >
                        + Add Button
                    </button>
                )}
            </div>
        </div>
    );
}

function TemplateConfig({ config, updateConfig }) {
    const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const { apiCall, session } = useAuth();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const selectedSource = config.templateSource || 'whatsapp';
    const selectedFlowTemplate = FLOW_TEMPLATES.find((template) => template.id === config.flowTemplateId) || null;

    const setSource = (source) => {
        updateConfig('templateSource', source);

        if (source === 'flow') {
            updateConfig('templateName', '');
            updateConfig('template', selectedFlowTemplate?.name || FLOW_TEMPLATES[0]?.name || '');
            updateConfig('flowTemplateId', selectedFlowTemplate?.id || FLOW_TEMPLATES[0]?.id || '');
            updateConfig('language', 'Flow Template');
            return;
        }

        updateConfig('flowTemplateId', '');
        updateConfig('template', config.templateName || '');
        updateConfig('language', config.language || 'en_US');
    };

    useEffect(() => {
        if (!session?.access_token) {
            setTemplates([]);
            setLoading(false);
            setError('');
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError('');

        apiCall(`${API_URL}/api/whatsapp/templates`)
            .then(async (response) => {
                const data = await response.json().catch(() => []);
                if (!isMounted) return;

                if (!response.ok) {
                    setTemplates([]);
                    setError(data?.error || 'Could not load templates.');
                    return;
                }

                setTemplates(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (!isMounted) return;
                setTemplates([]);
                setError('Could not load templates.');
            })
            .finally(() => {
                if (isMounted) {
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [API_URL, apiCall, session?.access_token]);

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Template Source</label>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => setSource('whatsapp')}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${selectedSource === 'whatsapp' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-700'}`}
                    >
                        WhatsApp Template
                    </button>
                    <button
                        type="button"
                        onClick={() => setSource('flow')}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${selectedSource === 'flow' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-700'}`}
                    >
                        Flow Template
                    </button>
                </div>
            </div>

            {selectedSource === 'whatsapp' ? (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Template Select karo</label>
                    <select
                        value={config.templateName || ''}
                        disabled={loading || !!error}
                        onChange={(e) => {
                            const selected = templates.find((template) => template.name === e.target.value);
                            updateConfig('templateName', e.target.value);
                            updateConfig('template', e.target.value);
                            updateConfig('language', selected?.language || config.language || 'en_US');
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
                    >
                        <option value="">
                            {loading ? 'Loading templates...' : error ? 'Template unavailable' : '-- Template choose karo --'}
                        </option>
                        {templates.map((template) => (
                            <option key={template.name || template.id} value={template.name || template.id}>
                                {template.name || template.id} {template.status ? `(${template.status})` : ''}
                            </option>
                        ))}
                    </select>
                    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                    {!loading && !error && templates.length === 0 && (
                        <p className="mt-2 text-xs text-gray-500">No approved Meta templates found for this account.</p>
                    )}
                </div>
            ) : (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Flow Template Select karo</label>
                    <select
                        value={config.flowTemplateId || ''}
                        onChange={(e) => {
                            const selected = FLOW_TEMPLATES.find((template) => template.id === e.target.value);
                            updateConfig('flowTemplateId', e.target.value);
                            updateConfig('template', selected?.name || '');
                            updateConfig('templateName', '');
                            updateConfig('language', 'Flow Template');
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                        <option value="">-- Flow template choose karo --</option>
                        {FLOW_TEMPLATES.map((template) => (
                            <option key={template.id} value={template.id}>
                                {template.name} · {template.category}
                            </option>
                        ))}
                    </select>
                    {selectedFlowTemplate && (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                            <div className="font-semibold">{selectedFlowTemplate.name}</div>
                            <div className="mt-1 text-xs text-emerald-800">{selectedFlowTemplate.description}</div>
                            <div className="mt-2 text-[11px] text-emerald-700">
                                {selectedFlowTemplate.preview.nodes.length} nodes · {selectedFlowTemplate.minutes} min
                            </div>
                        </div>
                    )}
                </div>
            )}

            {(selectedSource === 'whatsapp' ? config.templateName : selectedFlowTemplate?.name) && (
                <div className="p-3 bg-indigo-50 rounded-lg">
                    <p className="text-xs text-indigo-600 font-medium">Selected: {selectedSource === 'whatsapp' ? config.templateName : selectedFlowTemplate?.name}</p>
                    <p className="text-xs text-gray-500">Type: {selectedSource === 'whatsapp' ? 'WhatsApp Template' : 'Flow Template'}</p>
                    <p className="text-xs text-gray-500">Language: {config.language || (selectedSource === 'flow' ? 'Flow Template' : 'en_US')}</p>
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Template Variables (optional)</label>
                <textarea
                    value={config.variables || ''}
                    onChange={(e) => updateConfig('variables', e.target.value)}
                    placeholder={'{"1": "John", "2": "Order #123"}'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    rows={3}
                />
                <p className="text-xs text-gray-400 mt-1">JSON format mein variable values do</p>
            </div>
        </div>
    );
}

function InteractiveListConfig({ config, updateConfig }) {
    const items = config.items || [{ id: 'item1', title: '', description: '' }];

    const updateItem = (index, field, value) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        updateConfig('items', newItems);
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Header Text</label>
                <input type="text" value={config.headerText || ''} onChange={(e) => updateConfig('headerText', e.target.value)} placeholder="Choose an option:" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Button Label</label>
                <input type="text" value={config.buttonLabel || ''} onChange={(e) => updateConfig('buttonLabel', e.target.value)} placeholder="View Options" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">List Items</label>
                {items.map((item, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg space-y-2 mb-2">
                        <input type="text" value={item.id} onChange={(e) => updateItem(idx, 'id', e.target.value)} placeholder="ID (e.g. opt1)" className="w-full px-2 py-1 border rounded text-xs font-mono" />
                        <input type="text" value={item.title} onChange={(e) => updateItem(idx, 'title', e.target.value)} placeholder="Title" className="w-full px-2 py-1 border rounded text-sm" />
                        <input type="text" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="Description (optional)" className="w-full px-2 py-1 border rounded text-sm" />
                    </div>
                ))}
                <button onClick={() => updateConfig('items', [...items, { id: `item${items.length + 1}`, title: '', description: '' }])} className="w-full py-1.5 border-dashed border-2 border-gray-300 rounded text-sm text-gray-400 hover:text-teal-600">
                    + Add Item
                </button>
            </div>
        </div>
    );
}

function LocationConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Latitude
                </label>
                <input
                    type="text"
                    value={config.latitude || ''}
                    onChange={(e) => updateConfig('latitude', e.target.value)}
                    placeholder="37.7749"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Longitude
                </label>
                <input
                    type="text"
                    value={config.longitude || ''}
                    onChange={(e) => updateConfig('longitude', e.target.value)}
                    placeholder="-122.4194"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address Name
                </label>
                <input
                    type="text"
                    value={config.address || ''}
                    onChange={(e) => updateConfig('address', e.target.value)}
                    placeholder="San Francisco, CA"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>
    );
}

function HTTPAPIConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Label
                </label>
                <input
                    type="text"
                    value={config.label || ''}
                    onChange={(e) => updateConfig('label', e.target.value)}
                    placeholder="Check order status"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    HTTP Method
                </label>
                <select
                    value={config.method || 'GET'}
                    onChange={(e) => updateConfig('method', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL
                </label>
                <input
                    type="url"
                    value={config.url || ''}
                    onChange={(e) => updateConfig('url', e.target.value)}
                    placeholder="https://api.example.com/endpoint"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            {(config.method === 'POST' || config.method === 'PUT') && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Request Body (JSON)
                    </label>
                    <textarea
                        value={config.body || ''}
                        onChange={(e) => updateConfig('body', e.target.value)}
                        placeholder='{"key": "value"}'
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        rows={4}
                    />
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Headers (JSON)
                </label>
                <textarea
                    value={config.headers || ''}
                    onChange={(e) => updateConfig('headers', e.target.value)}
                    placeholder='{"Authorization": "Bearer {{api_token}}"}'
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    rows={3}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Save Response To
                </label>
                <input
                    type="text"
                    value={config.saveResponseTo || ''}
                    onChange={(e) => updateConfig('saveResponseTo', e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase())}
                    placeholder="api_response"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Use later as <span className="font-mono">{'{{api_response}}'}</span>.</p>
            </div>
        </div>
    );
}

function AIConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Label</label>
                <input
                    type="text"
                    value={config.label || ''}
                    onChange={(e) => updateConfig('label', e.target.value)}
                    placeholder="AI knowledge reply"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Instruction / Prompt</label>
                <textarea
                    value={config.prompt || ''}
                    onChange={(e) => updateConfig('prompt', e.target.value)}
                    placeholder="Answer using the business knowledge base. Keep the reply short and helpful."
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fallback Message</label>
                <textarea
                    value={config.fallbackMessage || ''}
                    onChange={(e) => updateConfig('fallbackMessage', e.target.value)}
                    placeholder="I could not find that in our knowledge base. I am connecting you to the team."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                    type="checkbox"
                    checked={config.handoffOnFallback === true}
                    onChange={(e) => updateConfig('handoffOnFallback', e.target.checked)}
                />
                Request human handoff when AI has no answer
            </label>
        </div>
    );
}

function GoogleSheetsConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Label</label>
                <input
                    type="text"
                    value={config.label || ''}
                    onChange={(e) => updateConfig('label', e.target.value)}
                    placeholder="Save lead to sheet"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
                <select
                    value={config.action || 'append_row'}
                    onChange={(e) => updateConfig('action', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                    <option value="append_row">Append row</option>
                    <option value="update_row">Update row</option>
                    <option value="find_row">Find row</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Spreadsheet ID or URL</label>
                <input
                    type="text"
                    value={config.spreadsheet || ''}
                    onChange={(e) => updateConfig('spreadsheet', e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sheet / Tab Name</label>
                <input
                    type="text"
                    value={config.sheetName || ''}
                    onChange={(e) => updateConfig('sheetName', e.target.value)}
                    placeholder="Leads"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Column Mapping (JSON)</label>
                <textarea
                    value={config.columnMapping || ''}
                    onChange={(e) => updateConfig('columnMapping', e.target.value)}
                    placeholder='{"Name": "{{name}}", "Phone": "{{phone}}", "Message": "{{customer_question}}"}'
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
                />
            </div>
        </div>
    );
}

function WhatsAppFlowConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Flow ID</label>
                <input
                    type="text"
                    value={config.flowId || ''}
                    onChange={(e) => updateConfig('flowId', e.target.value)}
                    placeholder="Meta WhatsApp Flow ID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Button Text</label>
                <input
                    type="text"
                    value={config.buttonText || ''}
                    onChange={(e) => updateConfig('buttonText', e.target.value)}
                    placeholder="Open form"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea
                    value={config.message || ''}
                    onChange={(e) => updateConfig('message', e.target.value)}
                    placeholder="Please fill this form to continue."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
            </div>
        </div>
    );
}

function AppointmentConfig({ config, updateConfig }) {
    const getApiUrl = () => {
        if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            return 'http://localhost:3001';
        }
        return 'https://wb.getaipilot.in';
    };
    const API_URL = getApiUrl();
    const auth = useAuth() || {};
    const [googleStatus, setGoogleStatus] = useState({ connected: false, connectedEmail: '' });
    const [loadingGoogle, setLoadingGoogle] = useState(false);

    const getOrgId = () => {
        return auth.memberProfile?.organization_id || auth.user?.organization_id || auth.user?.id || localStorage.getItem('organization_id') || localStorage.getItem('org_id') || '';
    };

    useEffect(() => {
        const checkGoogleStatus = async () => {
            try {
                const orgId = getOrgId();
                const res = await fetch(`${API_URL}/api/integrations/google/status?organization_id=${orgId}`);
                if (res.ok) {
                    const data = await res.json();
                    setGoogleStatus(data);
                }
            } catch (e) {
                console.error('Failed to check Google status:', e);
            }
        };

        checkGoogleStatus();

        const handleMessage = (event) => {
            if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
                setGoogleStatus({
                    connected: true,
                    connectedEmail: event.data.connectedEmail || 'Google Account'
                });
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [auth.memberProfile, auth.user]);

    const handleConnectGoogle = async () => {
        try {
            setLoadingGoogle(true);
            const orgId = getOrgId();
            const res = await fetch(`${API_URL}/api/integrations/google/auth-url?organization_id=${orgId}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to get auth URL');
            }
            const { url } = await res.json();

            const width = 500;
            const height = 650;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            window.open(
                url,
                'GoogleAuthPopup',
                `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
            );
        } catch (e) {
            console.error('Failed to launch Google auth popup:', e);
            notify.error(e.message || 'Failed to launch Google Calendar connection. Ensure server environment variables are set.');
        } finally {
            setLoadingGoogle(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Section 1: Invitation Message */}
            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
                <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider">Section 1: Invitation Message</h3>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Message Text</label>
                    <textarea
                        value={config.message || ''}
                        onChange={(e) => updateConfig('message', e.target.value)}
                        placeholder="Please select a date for your appointment from the options below:"
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    />
                    <p className="mt-1 text-[10px] text-gray-500">This text initiates the booking process and accompanies the list of available dates.</p>
                </div>
            </div>

            {/* Section 2: Input Settings */}
            <div className="p-4 bg-gray-50/70 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Section 2: Booking Settings</h3>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Appointment Type</label>
                    <input
                        type="text"
                        value={config.type || ''}
                        onChange={(e) => updateConfig('type', e.target.value)}
                        placeholder="Demo call"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Available Slots</label>
                    <textarea
                        value={config.slots || ''}
                        onChange={(e) => updateConfig('slots', e.target.value)}
                        placeholder="Mon-Fri, 10 AM - 6 PM"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    />
                    <p className="mt-1 text-[10px] text-gray-500">Specify days and time range (e.g. Mon-Fri, 10 AM - 6 PM).</p>
                </div>

                {/* Google Calendar Sync Section */}
                <div className="pt-3 border-t border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span>🗓️ Google Calendar Sync</span>
                        </label>
                        <input
                            type="checkbox"
                            checked={!!config.googleSyncEnabled}
                            onChange={(e) => updateConfig('googleSyncEnabled', e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                    </div>

                    {config.googleSyncEnabled && (
                        <div className="space-y-3 p-3 bg-white rounded-lg border border-purple-200 text-xs">
                            {googleStatus.connected ? (
                                <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 p-2.5 rounded-md border border-emerald-200">
                                    <div className="flex items-center gap-2 truncate">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                                        <span className="font-medium truncate">{googleStatus.connectedEmail}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleConnectGoogle}
                                        className="text-[10px] text-emerald-700 underline font-semibold shrink-0"
                                    >
                                        Change
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <button
                                        type="button"
                                        onClick={handleConnectGoogle}
                                        disabled={loadingGoogle}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all cursor-pointer"
                                    >
                                        <span>🔗</span>
                                        <span>{loadingGoogle ? 'Connecting...' : 'Connect Google Calendar'}</span>
                                    </button>
                                    <p className="mt-1 text-[10px] text-gray-500 text-center">Opens a secure Google OAuth popup window.</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-[11px] font-medium text-gray-700 mb-1">Buffer Padding</label>
                                <select
                                    value={config.googleBufferMinutes || '30'}
                                    onChange={(e) => updateConfig('googleBufferMinutes', e.target.value)}
                                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 bg-white"
                                >
                                    <option value="15">15 Minutes Buffer</option>
                                    <option value="30">30 Minutes Buffer</option>
                                    <option value="60">60 Minutes Buffer</option>
                                </select>
                                <p className="mt-1 text-[10px] text-gray-500">Filters out any slots within this buffer window of existing events.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Section 3: Confirmation Message */}
            <div className="p-4 bg-teal-50/50 rounded-xl border border-teal-100 space-y-3">
                <h3 className="text-xs font-bold text-teal-800 uppercase tracking-wider">Section 3: Confirmation Message</h3>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirmation Text</label>
                    <textarea
                        value={config.confirmationMessage || ''}
                        onChange={(e) => updateConfig('confirmationMessage', e.target.value)}
                        placeholder="Thanks {{name}}. Your {{type}} is scheduled for {{appointment_datetime}}."
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    />
                    <p className="mt-1 text-[10px] text-gray-500">Sent after a valid date and time slot is selected. You can use variables like `{"{{appointment_datetime}}"}`.</p>
                </div>
            </div>
        </div>
    );
}

function ProductConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Name</label>
                <input
                    type="text"
                    value={config.productName || ''}
                    onChange={(e) => updateConfig('productName', e.target.value)}
                    placeholder="Premium plan"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Price</label>
                <input
                    type="text"
                    value={config.price || ''}
                    onChange={(e) => updateConfig('price', e.target.value)}
                    placeholder="4999"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reply Message</label>
                <textarea
                    value={config.message || ''}
                    onChange={(e) => updateConfig('message', e.target.value)}
                    placeholder="I recommend {{product}} for your requirement."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                />
            </div>
        </div>
    );
}

function DefaultConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Label
                </label>
                <input
                    type="text"
                    value={config.label || ''}
                    onChange={(e) => updateConfig('label', e.target.value)}
                    placeholder="Enter label..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>
    );
}

function SmartDelayConfig({ config, updateConfig }) {
    const delay = config.delay || { seconds: 0, minutes: 0, hours: 0 };

    const updateDelay = (field, value) => {
        updateConfig('delay', { ...delay, [field]: parseInt(value) || 0 });
    };

    return (
        <div className="space-y-3 p-4 bg-blue-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700">
                Smart Delay in Reply
            </label>

            <div>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Seconds</span>
                    <span>{delay.seconds}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="60"
                    value={delay.seconds}
                    onChange={(e) => updateDelay('seconds', e.target.value)}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
            </div>

            <div>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Minutes</span>
                    <span>{delay.minutes}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="60"
                    value={delay.minutes}
                    onChange={(e) => updateDelay('minutes', e.target.value)}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
            </div>

            <div>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Hours</span>
                    <span>{delay.hours}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="24"
                    value={delay.hours}
                    onChange={(e) => updateDelay('hours', e.target.value)}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
            </div>
        </div>
    );
}
