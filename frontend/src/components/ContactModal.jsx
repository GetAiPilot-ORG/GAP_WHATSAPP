import { useState, useEffect } from 'react'
import Modal from './Modal'
import { Plus, Trash2 } from 'lucide-react'

const INTERNAL_CUSTOM_FIELD_KEYS = new Set(['profile_photo_url', 'profile_photo_checked_at', 'lid'])

export default function ContactModal({ isOpen, onClose, contact = null, onSave }) {
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        tags: '',
        custom_fields: []
    })

    useEffect(() => {
        if (contact) {
            setFormData({
                ...contact,
                tags: contact.tags.join(', '),
                custom_fields: Object.entries(contact.custom_fields || {})
                    .filter(([key]) => !INTERNAL_CUSTOM_FIELD_KEYS.has(key))
                    .map(([key, value]) => ({ key, value }))
            })
        } else {
            setFormData({
                name: '',
                phone: '',
                email: '',
                tags: '',
                custom_fields: []
            })
        }
    }, [contact, isOpen])

    const handleSubmit = (e) => {
        e.preventDefault()
        const preservedInternalFields = Object.fromEntries(
            Object.entries(contact?.custom_fields || {}).filter(([key]) => INTERNAL_CUSTOM_FIELD_KEYS.has(key))
        )
        const submission = {
            ...formData,
            tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
            custom_fields: {
                ...preservedInternalFields,
                ...formData.custom_fields.reduce((acc, field) => {
                    if (field.key) acc[field.key] = field.value
                    return acc
                }, {})
            }
        }
        onSave(submission)
        onClose()
    }

    const addCustomField = () => {
        setFormData(prev => ({
            ...prev,
            custom_fields: [...prev.custom_fields, { key: '', value: '' }]
        }))
    }

    const removeCustomField = (index) => {
        setFormData(prev => ({
            ...prev,
            custom_fields: prev.custom_fields.filter((_, i) => i !== index)
        }))
    }

    const updateCustomField = (index, field, value) => {
        const newFields = [...formData.custom_fields]
        newFields[index][field] = value
        setFormData(prev => ({ ...prev, custom_fields: newFields }))
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={contact ? 'Edit Contact' : 'New Contact'} maxWidth="max-w-lg">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input
                            required
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm focus:border-green-500 focus:ring-green-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                            required
                            type="tel"
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm focus:border-green-500 focus:ring-green-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                    <input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm focus:border-green-500 focus:ring-green-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                    <input
                        type="text"
                        value={formData.tags}
                        onChange={e => setFormData({ ...formData, tags: e.target.value })}
                        placeholder="Lead, VIP, 2024"
                        className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm focus:border-green-500 focus:ring-green-500"
                    />
                </div>

                {/* Custom Fields Section */}
                <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-900">Custom Fields</label>
                        <button
                            type="button"
                            onClick={addCustomField}
                            className="text-xs flex items-center gap-1 text-green-600 hover:text-green-700 font-medium"
                        >
                            <Plus className="h-3 w-3" /> Add Field
                        </button>
                    </div>

                    <div className="space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                        {formData.custom_fields.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-2">No custom fields added yet.</p>
                        )}
                        {formData.custom_fields.map((field, index) => (
                            <div key={index} className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Key (e.g. city)"
                                    value={field.key}
                                    onChange={e => updateCustomField(index, 'key', e.target.value)}
                                    className="flex-1 rounded-md border-gray-300 border px-2 py-1.5 text-sm focus:border-green-500 focus:ring-green-500"
                                />
                                <input
                                    type="text"
                                    placeholder="Value"
                                    value={field.value}
                                    onChange={e => updateCustomField(index, 'value', e.target.value)}
                                    className="flex-1 rounded-md border-gray-300 border px-2 py-1.5 text-sm focus:border-green-500 focus:ring-green-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeCustomField(index)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-sm"
                    >
                        Save Contact
                    </button>
                </div>
            </form>
        </Modal>
    )
}
