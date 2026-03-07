const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    timeIn: (user) => ipcRenderer.invoke('time-in', user),
    timeOut: (user) => ipcRenderer.invoke('time-out', user),
    sales: {
        getReferences: () => ipcRenderer.invoke('sales:references')
    },
    orders: {
        preview: (saleDate) => ipcRenderer.invoke('orders:preview', saleDate),
        get: (orderNumber) => ipcRenderer.invoke('orders:get', orderNumber),
        update: () => undefined,
        create: () => undefined,
        delete: () => undefined
    },
    inventoryVariants: {
        list: (filters) => ipcRenderer.invoke('inventory-variants:list', filters),
        create: () => undefined,
        update: () => undefined,
        delete: () => undefined,
        importCsv: () => undefined,
        listProducts: () => ipcRenderer.invoke('inventory-variants:products'),
        listSetsByProduct: (productName) => ipcRenderer.invoke('inventory-variants:sets', productName),
        resolve: (payload) => ipcRenderer.invoke('inventory-variants:resolve', payload)
    }
});
