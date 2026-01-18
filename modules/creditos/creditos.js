
// Módulo de Créditos y Cobranza - Lógica Profesional
class CreditosModule {
    constructor() {
        this.ventas = [];
        this.clientes = [];
        this.abonos = [];
        this.currentTab = 'cobranza';
        this.clienteSeleccionado = null;
        this.ventaSeleccionada = null;
        this.tipoAbonoActual = 'especifico';
        this.moduleId = 'creditos';
        this.init();
    }

    async init() {
        this.showLoading();

        try {
            await this.ensureModalsExist(); // Crear modales si no existen
            
            await Promise.all([
                this.loadVentasCredito(),
                this.loadClientes(),
                this.loadAbonos()
            ]);

            this.setupEventListeners();
            this.setupModalEventListeners(); // ✅ SIEMPRE configurar event listeners de modales

            // Renderizar estadísticas y tarjetas después de cargar todos los datos
            this.renderStats();
            this.renderClientesCards();

            console.log('✅ Módulo de créditos inicializado');
            console.log(`📊 Estadísticas: ${this.ventas.length} ventas, ${this.abonos.length} abonos`);
        } catch (error) {
            console.error('Error en inicialización:', error);
            this.showNotification('Error al cargar datos', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async ensureModalsExist() {
        // Verificar si los modales ya existen en el contenedor permanente
        if (document.getElementById('modal-abono')) {
            console.log('✅ Modales de créditos ya existen en el DOM permanente');
            return;
        }

        console.log('📦 Creando modales de créditos en el contenedor permanente...');
        
        // Obtener el contenedor permanente
        const permanentContainer = document.getElementById('permanent-modals-container');
        if (!permanentContainer) {
            console.error('❌ Contenedor permanente no encontrado');
            return;
        }

        // Cargar el HTML de los modales
        try {
            const response = await fetch('./modules/creditos/creditos-modals.html');
            const modalsHTML = await response.text();
            
            // Crear un div temporal para parsear el HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = modalsHTML;
            
            // Mover los modales al contenedor permanente
            while (tempDiv.firstChild) {
                permanentContainer.appendChild(tempDiv.firstChild);
            }
            
            console.log('✅ Modales de créditos creados en contenedor permanente');
            
        } catch (error) {
            console.error('❌ Error cargando modales:', error);
        }
    }

    setupModalEventListeners() {
        console.log('🔧 Configurando event listeners de modales de créditos...');
        
        // Event listeners del modal de abono
        const modalAbono = document.getElementById('modal-abono');
        const closeAbono = document.getElementById('modal-abono-close');
        const btnCancelarAbono = document.getElementById('btn-cancelar-abono');
        const btnConfirmarAbono = document.getElementById('btn-confirmar-abono');

        if (closeAbono) {
            closeAbono.onclick = () => this.cerrarModalAbono();
        }

        if (btnCancelarAbono) {
            btnCancelarAbono.onclick = () => this.cerrarModalAbono();
        }

        if (btnConfirmarAbono) {
            btnConfirmarAbono.onclick = () => this.confirmarAbono();
        }

        if (modalAbono) {
            modalAbono.onclick = (e) => {
                if (e.target === modalAbono) {
                    this.cerrarModalAbono();
                }
            };
        }

        // Event listeners del modal de detalle cliente
        const modalDetalle = document.getElementById('modal-detalle-cliente');
        const closeDetalle = document.getElementById('modal-detalle-cliente-close');

        if (closeDetalle) {
            closeDetalle.onclick = () => this.cerrarModalDetalleCliente();
        }

        if (modalDetalle) {
            modalDetalle.onclick = (e) => {
                if (e.target === modalDetalle) {
                    this.cerrarModalDetalleCliente();
                }
            };
        }

        // Tipo de abono
        document.querySelectorAll('input[name="tipo-abono"]').forEach(radio => {
            radio.onchange = (e) => {
                this.tipoAbonoActual = e.target.value;
                this.actualizarVistaAbono();
            };
        });

        // Monto abono
        const montoAbono = document.getElementById('monto-abono');
        if (montoAbono) {
            montoAbono.oninput = () => {
                this.validarMontoAbono();
            };
        }

        console.log('✅ Event listeners de modales de créditos configurados');
    }

    async loadVentasCredito() {
        try {
            // Cargar TODAS las ventas y filtrar localmente para manejar estructura antigua y nueva
            const querySnapshot = await window.db.collection('sales')
                .orderBy('fecha', 'desc')
                .limit(500) // Limitar para rendimiento
                .get();

            this.ventas = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();

                // Verificar si es venta a crédito (nueva estructura o antigua)
                const esCredito = data.tipoPago === 'credito' || 
                                 data.tipoVenta === 'credito' || 
                                 data.cliente?.tipo === 'credito';

                // Calcular saldo pendiente real
                const saldoPendiente = data.saldoPendiente !== undefined ? data.saldoPendiente : data.total;

                // Verificar si está realmente pendiente (debe tener saldo > 0 y NO estar completada/cancelada)
                const estaPendiente = saldoPendiente > 0 && 
                                     data.estado !== 'completada' && 
                                     data.estado !== 'cancelada' &&
                                     data.estado !== 'pagada';

                if (esCredito && estaPendiente) {
                    // Normalizar abonos como array
                    const abonosArray = Array.isArray(data.abonos) 
                        ? data.abonos 
                        : Object.values(data.abonos || {});

                    this.ventas.push({
                        id: doc.id,
                        ...data,
                        saldoPendiente: saldoPendiente,
                        abonos: abonosArray,
                        // Normalizar estructura
                        tipoPago: data.tipoPago || 'credito',
                        estado: data.estado || 'pendiente'
                    });
                }
            });

            console.log(`✅ Ventas a crédito cargadas: ${this.ventas.length}`);
            console.log('📊 Total por cobrar:', this.ventas.reduce((sum, v) => sum + v.saldoPendiente, 0));
        } catch (error) {
            console.error('Error al cargar ventas a crédito:', error);
        }
    }

    async loadClientes() {
        try {
            const querySnapshot = await window.db.collection('clients').get();
            this.clientes = [];
            querySnapshot.forEach((doc) => {
                this.clientes.push({ id: doc.id, ...doc.data() });
            });
        } catch (error) {
            console.error('Error al cargar clientes:', error);
        }
    }

    async loadAbonos() {
        try {
            // Cargar abonos de los últimos 90 días para tener historial completo
            const hace90Dias = new Date();
            hace90Dias.setDate(hace90Dias.getDate() - 90);
            hace90Dias.setHours(0, 0, 0, 0);

            const querySnapshot = await window.db.collection('abonos')
                .where('fecha', '>=', hace90Dias)
                .orderBy('fecha', 'desc')
                .limit(500)
                .get();

            this.abonos = [];
            querySnapshot.forEach((doc) => {
                this.abonos.push({ id: doc.id, ...doc.data() });
            });

            console.log(`✅ Abonos cargados: ${this.abonos.length}`);
        } catch (error) {
            console.error('Error al cargar abonos:', error);
        }
    }

    setupEventListeners() {
        // Sistema de Tabs Profesional
        this.setupTabsSystem();

        const tabs = document.querySelectorAll('.creditos-tab');
        tabs.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const tab = btn.dataset.tab;
                console.log('📑 Tab clickeada:', tab);
                this.switchTab(tab, btn);
            };
        });

        // Búsqueda de cliente
        const searchInput = document.getElementById('search-cliente-credito');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.buscarCliente(e.target.value);
            };
        }

        // Cerrar dropdown al hacer click fuera
        document.onclick = (e) => {
            if (!e.target.closest('.search-container')) {
                const dropdown = document.getElementById('clientes-dropdown');
                if (dropdown) {
                    dropdown.classList.remove('active');
                }
            }
        };

        // Filtros
        const filterOrden = document.getElementById('filter-orden');
        const filterEstado = document.getElementById('filter-estado-deuda');
        const historialSearch = document.getElementById('historial-search');
        const filterPeriodo = document.getElementById('filter-periodo-historial');

        if (filterOrden) filterOrden.onchange = () => this.renderClientesCards();
        if (filterEstado) filterEstado.onchange = () => this.renderClientesCards();
        if (historialSearch) historialSearch.oninput = () => this.filtrarHistorial();
        if (filterPeriodo) filterPeriodo.onchange = () => this.filtrarHistorial();
    }

    setupTabsSystem() {
        const tabs = document.querySelectorAll('.creditos-tab');
        const indicator = document.querySelector('.tab-indicator');

        // Inicializar el indicador en la primera pestaña
        const activeTab = document.querySelector('.creditos-tab.active');
        if (activeTab && indicator) {
            this.updateTabIndicator(activeTab, indicator);
        }

        // Actualizar indicador al redimensionar la ventana
        window.addEventListener('resize', () => {
            const currentActiveTab = document.querySelector('.creditos-tab.active');
            if (currentActiveTab && indicator) {
                this.updateTabIndicator(currentActiveTab, indicator, false);
            }
        });
    }

    updateTabIndicator(activeTab, indicator, animate = true) {
        if (!activeTab || !indicator) return;

        const tabsContainer = activeTab.parentElement;
        const tabRect = activeTab.getBoundingClientRect();
        const containerRect = tabsContainer.getBoundingClientRect();

        const left = tabRect.left - containerRect.left;
        const width = tabRect.width;

        if (!animate) {
            indicator.style.transition = 'none';
        }

        indicator.style.width = `${width}px`;
        indicator.style.transform = `translateX(${left}px)`;

        if (!animate) {
            setTimeout(() => {
                indicator.style.transition = '';
            }, 50);
        }
    }

    switchTab(tab, tabElement = null) {
        this.currentTab = tab;

        // Actualizar pestañas activas
        document.querySelectorAll('.creditos-tab').forEach(btn => {
            btn.classList.remove('active');
        });

        const targetTabElement = tabElement || document.querySelector(`[data-tab="${tab}"]`);
        if (targetTabElement) {
            targetTabElement.classList.add('active');

            // Actualizar indicador animado
            const indicator = document.querySelector('.tab-indicator');
            if (indicator) {
                this.updateTabIndicator(targetTabElement, indicator, true);
            }
        }

        // Actualizar contenido activo con transición suave
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const targetContent = document.getElementById(`tab-${tab}`);
        if (targetContent) {
            setTimeout(() => {
                targetContent.classList.add('active');
            }, 150);
        }

        if (tab === 'historial') {
            console.log('📋 Renderizando historial de abonos...');
            this.renderHistorialAbonos();
        } else if (tab === 'reportes') {
            this.renderReportes();
        } else if (tab === 'cobranza') {
            // Actualizar estadísticas al volver a cobranza
            this.renderStats();
        }
    }

    buscarCliente(termino) {
        const container = document.getElementById('clientes-dropdown');

        if (!termino || termino.length < 2) {
            container.classList.remove('active');
            return;
        }

        const search = termino.toLowerCase();

        // Buscar clientes que tengan deuda (filtrar por tipoPago = credito)
        const clientesConDeuda = this.clientes.filter(cliente => {
            const deudaTotal = this.calcularDeudaCliente(cliente.id);
            if (deudaTotal <= 0) return false;

            const nombre = (cliente.nombre || '').toLowerCase();
            const telefono = (cliente.telefono || '').toLowerCase();
            return nombre.includes(search) || telefono.includes(search);
        });

        if (clientesConDeuda.length === 0) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #6D6D80;">
                    <p>No se encontraron clientes con deuda</p>
                </div>
            `;
            container.classList.add('active');
            return;
        }

        const formatter = window.currencyFormatter;
        const html = clientesConDeuda.map(cliente => {
            const deuda = this.calcularDeudaCliente(cliente.id);
            return `
                <div class="cliente-dropdown-item" onclick="creditosModule.seleccionarCliente('${cliente.id}')">
                    <span class="cliente-dropdown-nombre">${cliente.nombre}</span>
                    <span class="cliente-dropdown-deuda">${formatter ? formatter.format(deuda) : '$' + deuda.toFixed(2)}</span>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
        container.classList.add('active');
    }

    calcularDeudaCliente(clienteId) {
        return this.ventas
            .filter(v => {
                // Solo contar ventas con saldo pendiente > 0 y no completadas
                const esDelCliente = v.cliente?.id === clienteId;
                const tieneSaldoPendiente = v.saldoPendiente > 0;
                const noCompletada = v.estado !== 'completada' && v.estado !== 'cancelada';
                return esDelCliente && tieneSaldoPendiente && noCompletada;
            })
            .reduce((sum, v) => sum + v.saldoPendiente, 0);
    }

    seleccionarCliente(clienteId) {
        this.clienteSeleccionado = this.clientes.find(c => c.id === clienteId);

        // Cerrar dropdown
        document.getElementById('clientes-dropdown').classList.remove('active');
        document.getElementById('search-cliente-credito').value = '';

        // Obtener ventas pendientes del cliente (con saldo > 0 y no completadas)
        const ventasCliente = this.ventas.filter(v => 
            v.cliente?.id === clienteId && 
            v.saldoPendiente > 0 &&
            v.estado !== 'completada' &&
            v.estado !== 'cancelada'
        );

        if (ventasCliente.length === 0) {
            this.showNotification('Este cliente no tiene ventas pendientes', 'info');
            return;
        }

        this.renderClienteInfo(ventasCliente);
    }

    renderClienteInfo(ventas) {
        const panel = document.getElementById('cliente-seleccionado-info');
        const deudaTotal = ventas.reduce((sum, v) => sum + (v.saldoPendiente || v.total), 0);
        const formatter = window.currencyFormatter;

        const ventasHTML = ventas.map(venta => {
            const fecha = venta.fecha?.toDate ? venta.fecha.toDate() : new Date(venta.fecha);
            const pagado = venta.total - (venta.saldoPendiente || venta.total);

            return `
                <div class="venta-pendiente-card" data-venta-id="${venta.id}">
                    <div class="venta-card-header">
                        <span class="folio-badge">${venta.folio}</span>
                        <span class="venta-fecha">${fecha.toLocaleDateString()}</span>
                    </div>
                    <div class="venta-card-body">
                        <div class="venta-detalle-item">
                            <span class="label">Total Venta:</span>
                            <span class="value">${formatter ? formatter.format(venta.total) : '$' + venta.total.toFixed(2)}</span>
                        </div>
                        <div class="venta-detalle-item">
                            <span class="label">Pagado:</span>
                            <span class="value amount-success">${formatter ? formatter.format(pagado) : '$' + pagado.toFixed(2)}</span>
                        </div>
                        <div class="venta-detalle-item">
                            <span class="label">Saldo Pendiente:</span>
                            <span class="value amount-danger">${formatter ? formatter.format(venta.saldoPendiente || venta.total) : '$' + (venta.saldoPendiente || venta.total).toFixed(2)}</span>
                        </div>
                        <div class="venta-detalle-item">
                            <span class="label">Abonos:</span>
                            <span class="value">${venta.abonos?.length || 0}</span>
                        </div>
                    </div>
                    <button class="btn-abono-venta" onclick="creditosModule.abrirModalAbono('${venta.id}')">
                        <svg style="width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; vertical-align: middle; margin-right: 6px;" viewBox="0 0 24 24">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        Abonar a esta venta
                    </button>
                </div>
            `;
        }).join('');

        panel.innerHTML = `
            <div class="cliente-header">
                <div class="cliente-nombre-info">
                    <h3>
                        <svg style="width: 24px; height: 24px; stroke: currentColor; fill: none; stroke-width: 2; vertical-align: middle; margin-right: 8px;" viewBox="0 0 24 24">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        ${this.clienteSeleccionado.nombre}
                    </h3>
                    <span class="cliente-telefono">${this.clienteSeleccionado.telefono || 'Sin teléfono'}</span>
                </div>
                <div class="deuda-total-display">
                    <span class="label">Deuda Total:</span>
                    <span class="amount">${formatter ? formatter.format(deudaTotal) : '$' + deudaTotal.toFixed(2)}</span>
                </div>
            </div>
            <div class="ventas-pendientes-lista">
                ${ventasHTML}
            </div>
            <button class="btn-primary" onclick="creditosModule.abrirModalAbono(null)" style="margin-top: 16px;">
                <svg style="width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; vertical-align: middle; margin-right: 6px;" viewBox="0 0 24 24">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                Abono General (Automático)
            </button>
        `;

        panel.style.display = 'block';
    }

    abrirModalAbono(ventaId = null) {
        if (!this.clienteSeleccionado) {
            this.showNotification('Selecciona un cliente primero', 'warning');
            return;
        }

        this.ventaSeleccionada = ventaId;

        const modal = document.getElementById('modal-abono');
        if (modal) {
            // Reset completo: modal, wrapper y content (igual que notas)
            modal.style.cssText = '';
            const wrapper = modal.querySelector('.modal-creditos-wrapper');
            const content = modal.querySelector('.modal-creditos-content');
            
            if (wrapper) wrapper.style.cssText = '';
            if (content) content.style.cssText = '';
        }
        
        const deudaTotal = this.calcularDeudaCliente(this.clienteSeleccionado.id);
        const formatter = window.currencyFormatter;

        // Actualizar información del cliente
        document.getElementById('abono-cliente-nombre').textContent = this.clienteSeleccionado.nombre;
        document.getElementById('abono-deuda-total').textContent = formatter ? formatter.format(deudaTotal) : '$' + deudaTotal.toFixed(2);

        // Si es para venta específica, pre-seleccionar
        if (ventaId) {
            document.querySelector('input[name="tipo-abono"][value="especifico"]').checked = true;
            this.tipoAbonoActual = 'especifico';

            // Pre-llenar el monto con el saldo pendiente de la venta
            const venta = this.ventas.find(v => v.id === ventaId);
            if (venta) {
                const saldoPendiente = venta.saldoPendiente || venta.total;
                document.getElementById('monto-abono').value = saldoPendiente.toFixed(2);
            }
        } else {
            document.querySelector('input[name="tipo-abono"][value="general"]').checked = true;
            this.tipoAbonoActual = 'general';
            // Reset monto
            document.getElementById('monto-abono').value = '';
        }

        this.renderVentasPendientes();
        this.actualizarVistaAbono();

        // Reset otros campos
        document.getElementById('notas-abono').value = '';
        document.getElementById('abono-hint').textContent = '';
        document.getElementById('metodo-pago-abono').value = 'efectivo';

        // Deshabilitar botón de confirmar inicialmente
        const btnConfirmar = document.getElementById('btn-confirmar-abono');
        if (btnConfirmar) btnConfirmar.disabled = false;

        // Validar monto inicial si hay uno pre-llenado
        if (ventaId) {
            setTimeout(() => this.validarMontoAbono(), 100);
        }

        modal.classList.add('active');
        modal.scrollTop = 0;

        // Enfocar el campo de monto
        setTimeout(() => {
            document.getElementById('monto-abono').focus();
            document.getElementById('monto-abono').select();
        }, 200);
    }

    renderVentasPendientes() {
        const container = document.getElementById('ventas-pendientes-container');
        const ventas = this.ventas.filter(v => 
            v.cliente?.id === this.clienteSeleccionado.id && v.estado === 'pendiente'
        );

        const formatter = window.currencyFormatter;

        const html = ventas.map(venta => {
            const fecha = venta.fecha?.toDate ? venta.fecha.toDate() : new Date(venta.fecha);
            const isSelected = venta.id === this.ventaSeleccionada;

            return `
                <div class="venta-pendiente-card ${isSelected ? 'selected' : ''}" 
                     onclick="creditosModule.seleccionarVentaAbono('${venta.id}')">
                    <div class="venta-card-header">
                        <span class="folio-badge">${venta.folio}</span>
                        <span class="venta-fecha">${fecha.toLocaleDateString()}</span>
                    </div>
                    <div class="venta-card-body">
                        <div class="venta-detalle-item">
                            <span class="label">Saldo Pendiente:</span>
                            <span class="value amount-danger">${formatter ? formatter.format(venta.saldoPendiente || venta.total) : '$' + (venta.saldoPendiente || venta.total).toFixed(2)}</span>
                        </div>
                        <div class="venta-detalle-item">
                            <span class="label">Total Venta:</span>
                            <span class="value">${formatter ? formatter.format(venta.total) : '$' + venta.total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    seleccionarVentaAbono(ventaId) {
        if (this.tipoAbonoActual !== 'especifico') return;

        this.ventaSeleccionada = ventaId;

        // Pre-llenar el monto con el saldo pendiente de la venta seleccionada
        const venta = this.ventas.find(v => v.id === ventaId);
        if (venta) {
            const saldoPendiente = venta.saldoPendiente || venta.total;
            document.getElementById('monto-abono').value = saldoPendiente.toFixed(2);
        }

        this.renderVentasPendientes();
        this.validarMontoAbono();

        // Enfocar el campo de monto para que el usuario pueda editar fácilmente
        setTimeout(() => {
            const montoInput = document.getElementById('monto-abono');
            montoInput.focus();
            montoInput.select();
        }, 100);
    }

    actualizarVistaAbono() {
        const container = document.getElementById('ventas-pendientes-container');
        const montoInput = document.getElementById('monto-abono');

        if (this.tipoAbonoActual === 'general') {
            container.style.display = 'none';
            this.ventaSeleccionada = null;

            // Limpiar monto al cambiar a general
            montoInput.value = '';
            document.getElementById('abono-hint').textContent = 'El abono se distribuirá automáticamente a las ventas más antiguas';

            // Enfocar campo de monto
            setTimeout(() => montoInput.focus(), 100);
        } else {
            container.style.display = 'block';
            this.renderVentasPendientes();

            // Si ya hay una venta seleccionada, pre-llenar el monto
            if (this.ventaSeleccionada) {
                const venta = this.ventas.find(v => v.id === this.ventaSeleccionada);
                if (venta) {
                    const saldoPendiente = venta.saldoPendiente || venta.total;
                    montoInput.value = saldoPendiente.toFixed(2);
                    this.validarMontoAbono();
                }
            } else {
                montoInput.value = '';
                document.getElementById('abono-hint').textContent = 'Selecciona una venta para abonar';
            }
        }
    }

    validarMontoAbono() {
        const montoInput = document.getElementById('monto-abono');
        const monto = parseFloat(montoInput.value) || 0;
        const hint = document.getElementById('abono-hint');
        const btnConfirmar = document.getElementById('btn-confirmar-abono');

        // Si no hay monto ingresado, solo limpiar mensaje
        if (!montoInput.value || montoInput.value.trim() === '') {
            hint.textContent = '';
            hint.style.color = '#6D6D80';
            if (btnConfirmar) btnConfirmar.disabled = true;
            return false;
        }

        // Validar que sea un número válido mayor a cero
        if (isNaN(monto) || monto <= 0) {
            hint.textContent = '⚠️ Ingresa un monto válido mayor a cero';
            hint.style.color = '#FF9500';
            if (btnConfirmar) btnConfirmar.disabled = true;
            return false;
        }

        if (this.tipoAbonoActual === 'especifico' && this.ventaSeleccionada) {
            const venta = this.ventas.find(v => v.id === this.ventaSeleccionada);
            if (!venta) {
                hint.textContent = '⚠️ Selecciona una venta';
                hint.style.color = '#FF9500';
                if (btnConfirmar) btnConfirmar.disabled = true;
                return false;
            }

            const saldoPendiente = venta.saldoPendiente || venta.total;
            const formatter = window.currencyFormatter;

            if (monto > saldoPendiente) {
                hint.textContent = `⚠️ El monto excede el saldo pendiente de ${formatter ? formatter.format(saldoPendiente) : '$' + saldoPendiente.toFixed(2)}`;
                hint.style.color = '#FF9500';
                if (btnConfirmar) btnConfirmar.disabled = true;
                return false;
            } else if (monto === saldoPendiente) {
                hint.textContent = '✅ Este abono liquidará completamente la venta';
                hint.style.color = '#34C759';
                if (btnConfirmar) btnConfirmar.disabled = false;
                return true;
            } else {
                const restante = saldoPendiente - monto;
                hint.textContent = `Saldo restante: ${formatter ? formatter.format(restante) : '$' + restante.toFixed(2)}`;
                hint.style.color = '#007AFF';
                if (btnConfirmar) btnConfirmar.disabled = false;
                return true;
            }
        } else if (this.tipoAbonoActual === 'general') {
            const deudaTotal = this.calcularDeudaCliente(this.clienteSeleccionado.id);
            const formatter = window.currencyFormatter;

            if (monto > deudaTotal) {
                hint.textContent = `⚠️ El monto excede la deuda total de ${formatter ? formatter.format(deudaTotal) : '$' + deudaTotal.toFixed(2)}`;
                hint.style.color = '#FF9500';
                if (btnConfirmar) btnConfirmar.disabled = true;
                return false;
            } else {
                const numVentas = this.ventas.filter(v => v.cliente?.id === this.clienteSeleccionado.id && v.estado === 'pendiente').length;
                hint.textContent = `Se distribuirá a ${numVentas} venta${numVentas !== 1 ? 's' : ''} pendiente${numVentas !== 1 ? 's' : ''}`;
                hint.style.color = '#007AFF';
                if (btnConfirmar) btnConfirmar.disabled = false;
                return true;
            }
        } else {
            // Tipo específico pero sin venta seleccionada
            hint.textContent = '⚠️ Selecciona una venta para abonar';
            hint.style.color = '#FF9500';
            if (btnConfirmar) btnConfirmar.disabled = true;
            return false;
        }
    }

    async confirmarAbono() {
        const montoInput = document.getElementById('monto-abono');
        const monto = parseFloat(montoInput.value) || 0;
        const metodo = document.getElementById('metodo-pago-abono').value;
        const notas = document.getElementById('notas-abono').value.trim();

        // Validación de monto
        if (!montoInput.value || montoInput.value.trim() === '' || isNaN(monto) || monto <= 0) {
            this.showNotification('❌ Ingresa un monto válido mayor a cero', 'error');
            document.getElementById('monto-abono').focus();
            return;
        }

        // Validación de venta seleccionada para abonos específicos
        if (this.tipoAbonoActual === 'especifico' && !this.ventaSeleccionada) {
            this.showNotification('❌ Selecciona una venta para abonar', 'error');
            return;
        }

        // Validación final del monto
        if (!this.validarMontoAbono()) {
            this.showNotification('❌ El monto no es válido para este abono', 'warning');
            return;
        }

        // Validación de método de pago
        if (!metodo) {
            this.showNotification('❌ Selecciona un método de pago', 'error');
            return;
        }

        this.showLoading();

        try {
            console.log('💰 Procesando abono:', {
                tipo: this.tipoAbonoActual,
                monto,
                metodo,
                cliente: this.clienteSeleccionado?.nombre
            });

            if (this.tipoAbonoActual === 'especifico') {
                await this.procesarAbonoEspecifico(monto, metodo, notas);
                console.log('✅ Abono específico procesado');
            } else {
                await this.procesarAbonoGeneral(monto, metodo, notas);
                console.log('✅ Abono general procesado');
            }

            // Recargar datos antes de cerrar modal
            console.log('🔄 Recargando datos...');
            await this.loadVentasCredito();
            await this.loadAbonos();

            // Actualizar estadísticas inmediatamente
            this.renderStats();
            this.renderClientesCards();

            this.cerrarModalAbono();

            // Limpiar selección
            document.getElementById('cliente-seleccionado-info').style.display = 'none';
            this.clienteSeleccionado = null;

            const formatter = window.currencyFormatter;
            const mensaje = `✅ Abono registrado exitosamente\n\nMonto: ${formatter ? formatter.format(monto) : '$' + monto.toFixed(2)}\nMétodo: ${metodo}`;
            this.showNotification(mensaje, 'success');

        } catch (error) {
            console.error('❌ Error al procesar abono:', error);
            console.error('Detalles:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });

            let mensajeError = 'Error al procesar el abono';
            if (error.code === 'permission-denied') {
                mensajeError = '❌ No tienes permisos para registrar abonos';
            } else if (error.code === 'not-found') {
                mensajeError = '❌ No se encontró la venta';
            } else if (error.message) {
                mensajeError = `❌ Error: ${error.message}`;
            }

            this.showNotification(mensajeError, 'error');
        } finally {
            this.hideLoading();
            // Asegurar que las estadísticas se actualicen incluso si hay error
            this.renderStats();
        }
    }

    async procesarAbonoEspecifico(monto, metodo, notas) {
        const venta = this.ventas.find(v => v.id === this.ventaSeleccionada);
        const saldoAnterior = venta.saldoPendiente || venta.total;
        const nuevoSaldo = Math.max(0, saldoAnterior - monto);

        // Crear registro de abono en Timestamp de Firebase
        const abonoData = {
            ventaId: venta.id,
            folioVenta: venta.folio,
            clienteId: this.clienteSeleccionado.id,
            clienteNombre: this.clienteSeleccionado.nombre,
            monto: monto,
            saldoAnterior: saldoAnterior,
            nuevoSaldo: nuevoSaldo,
            metodoPago: metodo,
            notas: notas || '',
            fecha: firebase.firestore.Timestamp.fromDate(new Date()),
            recibidoPor: window.authSystem?.currentUser?.uid || 'unknown',
            recibidoPorNombre: window.authSystem?.currentUser?.nombre || 'Usuario',
            tipo: 'especifico'
        };

        // Guardar abono en colección de abonos
        const abonoDoc = await window.db.collection('abonos').add(abonoData);

        // 🚀 SINCRONIZACIÓN CON CAJA MAYOR (Módulo de Pagos)
        // Registrar el abono como un ingreso en la colección 'pagos' para que sume al saldo global
        try {
            await window.db.collection('pagos').add({
                tipo: 'ingreso',
                concepto: `Abono de cliente: ${this.clienteSeleccionado.nombre} (Venta: ${venta.folio})`,
                monto: monto,
                categoria: 'Abonos Créditos',
                observaciones: notas || `Abono a venta ${venta.folio}`,
                fecha: firebase.firestore.Timestamp.fromDate(new Date()),
                registradoPor: abonoData.recibidoPor,
                registradoPorNombre: abonoData.recibidoPorNombre,
                referenciaId: abonoDoc.id,
                ventaId: venta.id
            });
            console.log('✅ Abono sincronizado con el saldo de caja mayor');
        } catch (cajaError) {
            console.error('❌ Error al sincronizar abono con caja mayor:', cajaError);
        }

        // Actualizar venta
        const ventaRef = window.db.collection('sales').doc(venta.id);

        // Obtener abonos actuales y normalizarlos como array
        const abonosActuales = Array.isArray(venta.abonos) 
            ? venta.abonos 
            : (venta.abonos ? Object.values(venta.abonos) : []);

        const nuevoAbono = {
            id: Date.now().toString(),
            monto: monto,
            fecha: firebase.firestore.Timestamp.fromDate(new Date()),
            metodo: metodo,
            recibidoPor: abonoData.recibidoPorNombre,
            notas: notas || ''
        };

        // Determinar nuevo estado
        const nuevoEstado = nuevoSaldo === 0 ? 'completada' : 'pendiente';

        await ventaRef.update({
            saldoPendiente: nuevoSaldo,
            estado: nuevoEstado,
            abonos: [...abonosActuales, nuevoAbono],
            ultimaActualizacion: firebase.firestore.Timestamp.fromDate(new Date())
        });
    }

    async procesarAbonoGeneral(monto, metodo, notas) {
        let montoRestante = monto;
        const batch = window.db.batch();
        const abonosRegistrados = [];

        // Obtener ventas pendientes ordenadas por fecha (más antiguas primero)
        const ventasPendientes = this.ventas
            .filter(v => v.cliente?.id === this.clienteSeleccionado.id && v.estado === 'pendiente')
            .sort((a, b) => {
                const fechaA = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha);
                const fechaB = b.fecha?.toDate ? b.fecha.toDate() : new Date(b.fecha);
                return fechaA - fechaB;
            });

        for (const venta of ventasPendientes) {
            if (montoRestante <= 0) break;

            const saldoAnterior = venta.saldoPendiente || venta.total;
            const montoAbono = Math.min(montoRestante, saldoAnterior);
            const nuevoSaldo = Math.max(0, saldoAnterior - montoAbono);

            // Crear registro de abono con Timestamp de Firebase
            const abonoData = {
                ventaId: venta.id,
                folioVenta: venta.folio,
                clienteId: this.clienteSeleccionado.id,
                clienteNombre: this.clienteSeleccionado.nombre,
                monto: montoAbono,
                saldoAnterior: saldoAnterior,
                nuevoSaldo: nuevoSaldo,
                metodoPago: metodo,
                notas: notas || 'Abono general automático',
                fecha: firebase.firestore.Timestamp.fromDate(new Date()),
                recibidoPor: window.authSystem?.currentUser?.uid || 'unknown',
                recibidoPorNombre: window.authSystem?.currentUser?.nombre || 'Usuario',
                tipo: 'general'
            };

            abonosRegistrados.push(abonoData);

            // Actualizar venta
            const ventaRef = window.db.collection('sales').doc(venta.id);

            // Obtener abonos actuales y normalizarlos como array
            const abonosActuales = Array.isArray(venta.abonos) 
                ? venta.abonos 
                : (venta.abonos ? Object.values(venta.abonos) : []);

            const nuevoAbono = {
                id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
                monto: montoAbono,
                fecha: firebase.firestore.Timestamp.fromDate(new Date()),
                metodo: metodo,
                recibidoPor: abonoData.recibidoPorNombre,
                notas: notas || 'Abono general automático'
            };

            // Determinar nuevo estado
            const nuevoEstado = nuevoSaldo === 0 ? 'completada' : 'pendiente';

            batch.update(ventaRef, {
                saldoPendiente: nuevoSaldo,
                estado: nuevoEstado,
                abonos: [...abonosActuales, nuevoAbono],
                ultimaActualizacion: firebase.firestore.Timestamp.fromDate(new Date())
            });

            montoRestante -= montoAbono;
        }

        // Guardar todos los abonos en la colección de abonos
        for (const abono of abonosRegistrados) {
            const abonoDoc = await window.db.collection('abonos').add(abono);
            
            // 🚀 SINCRONIZACIÓN CON CAJA MAYOR (Módulo de Pagos)
            try {
                await window.db.collection('pagos').add({
                    tipo: 'ingreso',
                    concepto: `Abono General: ${this.clienteSeleccionado.nombre} (Venta: ${abono.folioVenta})`,
                    monto: abono.monto,
                    categoria: 'Abonos Créditos',
                    observaciones: notas || 'Abono general automático',
                    fecha: firebase.firestore.Timestamp.fromDate(new Date()),
                    registradoPor: abono.recibidoPor,
                    registradoPorNombre: abono.recibidoPorNombre,
                    referenciaId: abonoDoc.id,
                    ventaId: abono.ventaId
                });
            } catch (cajaError) {
                console.error('❌ Error al sincronizar abono general con caja mayor:', cajaError);
            }
        }

        await batch.commit();
    }

    cerrarModalAbono() {
        const modal = document.getElementById('modal-abono');
        if (modal) {
            modal.classList.remove('active');
        }
        this.ventaSeleccionada = null;
    }

    renderStats() {
        console.log('📊 Calculando estadísticas...');
        console.log(`Ventas pendientes: ${this.ventas.length}`);
        console.log(`Abonos totales: ${this.abonos.length}`);

        const totalPorCobrar = this.ventas.reduce((sum, v) => sum + (v.saldoPendiente || v.total), 0);
        console.log(`Total por cobrar: $${totalPorCobrar.toFixed(2)}`);

        // Calcular vencidos (más de 30 días)
        const hoy = new Date();
        const creditosVencidos = this.ventas.filter(v => {
            const fecha = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
            const diasTranscurridos = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24));
            return diasTranscurridos > 30;
        }).reduce((sum, v) => sum + (v.saldoPendiente || v.total), 0);
        console.log(`Créditos vencidos: $${creditosVencidos.toFixed(2)}`);

        // Cobrado hoy
        const hoyInicio = new Date();
        hoyInicio.setHours(0, 0, 0, 0);
        const abonosHoy = this.abonos.filter(a => {
            const fechaAbono = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha);
            fechaAbono.setHours(0, 0, 0, 0);
            return fechaAbono.getTime() === hoyInicio.getTime();
        });
        const cobradoHoy = abonosHoy.reduce((sum, a) => sum + (a.monto || 0), 0);
        console.log(`Cobrado hoy: $${cobradoHoy.toFixed(2)} (${abonosHoy.length} abonos)`);

        // Clientes con deuda
        const clientesDeudores = new Set(this.ventas.map(v => v.cliente?.id).filter(id => id)).size;
        console.log(`Clientes con deuda: ${clientesDeudores}`);

        const formatter = window.currencyFormatter;
        document.getElementById('total-por-cobrar').textContent = formatter ? formatter.format(totalPorCobrar) : '$' + totalPorCobrar.toFixed(2);
        document.getElementById('creditos-vencidos').textContent = formatter ? formatter.format(creditosVencidos) : '$' + creditosVencidos.toFixed(2);
        document.getElementById('cobrado-hoy').textContent = formatter ? formatter.format(cobradoHoy) : '$' + cobradoHoy.toFixed(2);
        document.getElementById('clientes-deudores').textContent = clientesDeudores;

        console.log('✅ Estadísticas renderizadas');
    }

    renderClientesCards() {
        const container = document.getElementById('clientes-cards-container');
        const orden = document.getElementById('filter-orden')?.value || 'deuda-desc';
        const estadoFilter = document.getElementById('filter-estado-deuda')?.value || 'todos';

        // Obtener clientes únicos con deuda (estructura antigua y nueva)
        const clientesConDeuda = [];
        const clientesIds = new Set();

        this.ventas.forEach(venta => {
            // Solo ventas con saldo > 0 y no completadas
            if (venta.saldoPendiente > 0 && venta.cliente?.id) {
                clientesIds.add(venta.cliente.id);
            }
        });

        clientesIds.forEach(clienteId => {
            const cliente = this.clientes.find(c => c.id === clienteId);
            if (!cliente) return;

            const ventasCliente = this.ventas.filter(v => 
                v.cliente?.id === clienteId && 
                v.saldoPendiente > 0 &&
                v.estado !== 'completada' &&
                v.estado !== 'cancelada'
            );
            const deudaTotal = ventasCliente.reduce((sum, v) => sum + v.saldoPendiente, 0);

            // Solo agregar si realmente tiene deuda
            if (deudaTotal <= 0) return;

            // Calcular si está vencido
            const hoy = new Date();
            const tieneVencidos = ventasCliente.some(v => {
                const fecha = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
                const dias = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24));
                return dias > 30;
            });

            clientesConDeuda.push({
                ...cliente,
                deudaTotal,
                numVentas: ventasCliente.length,
                estado: tieneVencidos ? 'vencido' : 'vigente'
            });
        });

        // Filtrar por estado
        let clientesFiltrados = clientesConDeuda;
        if (estadoFilter !== 'todos') {
            clientesFiltrados = clientesConDeuda.filter(c => c.estado === estadoFilter);
        }

        // Ordenar
        clientesFiltrados.sort((a, b) => {
            if (orden === 'deuda-desc') return b.deudaTotal - a.deudaTotal;
            if (orden === 'deuda-asc') return a.deudaTotal - b.deudaTotal;
            if (orden === 'nombre') return a.nombre.localeCompare(b.nombre);
            if (orden === 'vencidos') return (b.estado === 'vencido' ? 1 : 0) - (a.estado === 'vencido' ? 1 : 0);
            return 0;
        });

        if (clientesFiltrados.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">✅</div>
                    <p>No hay clientes con deuda</p>
                </div>
            `;
            return;
        }

        const formatter = window.currencyFormatter;

        const html = clientesFiltrados.map(cliente => {
            const iniciales = cliente.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

            return `
                <div class="cliente-card" onclick="creditosModule.verDetalleCliente('${cliente.id}')">
                    <div class="cliente-card-header">
                        <div class="cliente-avatar">${iniciales}</div>
                        <div class="cliente-card-info">
                            <div class="cliente-card-nombre">${cliente.nombre}</div>
                            <div class="cliente-card-contacto">${cliente.telefono || 'Sin teléfono'}</div>
                        </div>
                    </div>
                    <div class="cliente-card-stats">
                        <div class="stat-item">
                            <span class="label">Deuda Total</span>
                            <span class="value" style="color: #FF3B30;">${formatter ? formatter.format(cliente.deudaTotal) : '$' + cliente.deudaTotal.toFixed(2)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="label">Ventas</span>
                            <span class="value">${cliente.numVentas}</span>
                        </div>
                    </div>
                    <div style="margin: 12px 0;">
                        <span class="estado-badge estado-${cliente.estado}">
                            ${cliente.estado === 'vencido' ? '⚠️ Vencido' : '✅ Vigente'}
                        </span>
                    </div>
                    <button class="btn-cobrar-cliente" onclick="event.stopPropagation(); creditosModule.seleccionarClienteRapido('${cliente.id}')">
                        <svg style="width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; vertical-align: middle; margin-right: 6px;" viewBox="0 0 24 24">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        Cobrar Ahora
                    </button>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    seleccionarClienteRapido(clienteId) {
        this.switchTab('cobranza');
        setTimeout(() => {
            this.seleccionarCliente(clienteId);
        }, 100);
    }

    verDetalleCliente(clienteId) {
        const cliente = this.clientes.find(c => c.id === clienteId);
        if (!cliente) return;

        const ventas = this.ventas.filter(v => v.cliente?.id === clienteId && v.estado === 'pendiente');
        const abonos = this.abonos.filter(a => a.clienteId === clienteId);
        const deudaTotal = ventas.reduce((sum, v) => sum + (v.saldoPendiente || v.total), 0);
        const formatter = window.currencyFormatter;

        const ventasHTML = ventas.map(v => {
            const fecha = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
            return `
                <tr>
                    <td>${v.folio}</td>
                    <td>${fecha.toLocaleDateString()}</td>
                    <td>${formatter ? formatter.format(v.total) : '$' + v.total.toFixed(2)}</td>
                    <td style="color: #34C759;">${formatter ? formatter.format(v.total - (v.saldoPendiente || v.total)) : '$' + (v.total - (v.saldoPendiente || v.total)).toFixed(2)}</td>
                    <td style="color: #FF3B30; font-weight: 700;">${formatter ? formatter.format(v.saldoPendiente || v.total) : '$' + (v.saldoPendiente || v.total).toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const abonosHTML = abonos.length > 0 ? abonos.map(a => {
            const fecha = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha);
            return `
                <tr>
                    <td>${fecha.toLocaleDateString()}</td>
                    <td>${a.folioVenta}</td>
                    <td>${formatter ? formatter.format(a.monto) : '$' + a.monto.toFixed(2)}</td>
                    <td>${this.getMetodoPagoLabel(a.metodoPago)}</td>
                </tr>
            `;
        }).join('') : '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #6D6D80;">Sin abonos registrados</td></tr>';

        const content = `
            <div style="padding: 20px;">
                <div style="background: linear-gradient(135deg, #007AFF, #5856D6); color: white; padding: 24px; border-radius: 14px; margin-bottom: 24px;">
                    <h2 style="margin: 0 0 8px 0;">
                        <svg style="width: 28px; height: 28px; stroke: currentColor; fill: none; stroke-width: 2; vertical-align: middle; margin-right: 8px;" viewBox="0 0 24 24">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        ${cliente.nombre}
                    </h2>
                    <p style="margin: 0; opacity: 0.9;">${cliente.telefono || 'Sin teléfono'}</p>
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2);">
                        <div style="font-size: 0.9rem; opacity: 0.9;">Deuda Total</div>
                        <div style="font-size: 2.5rem; font-weight: 700; margin-top: 4px;">${formatter ? formatter.format(deudaTotal) : '$' + deudaTotal.toFixed(2)}</div>
                    </div>
                </div>

                <h4 style="margin: 24px 0 12px 0;">
                    <svg style="width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; vertical-align: middle; margin-right: 6px;" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    Ventas Pendientes
                </h4>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                    <thead>
                        <tr style="background: #F8F9FA;">
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5E7;">Folio</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5E7;">Fecha</th>
                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E5E7;">Total</th>
                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E5E7;">Pagado</th>
                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E5E7;">Saldo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ventasHTML}
                    </tbody>
                </table>

                <h4 style="margin: 24px 0 12px 0;">
                    <svg style="width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; vertical-align: middle; margin-right: 6px;" viewBox="0 0 24 24">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    Historial de Abonos
                </h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #F8F9FA;">
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5E7;">Fecha</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E5E7;">Folio</th>
                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E5E7;">Monto</th>
                            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #E5E5E7;">Método</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${abonosHTML}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('detalle-cliente-content').innerHTML = content;
        
        const modal = document.getElementById('modal-detalle-cliente');
        if (modal) {
            // Reset completo: modal, wrapper y content (igual que notas)
            modal.style.cssText = '';
            const wrapper = modal.querySelector('.modal-creditos-wrapper');
            const content = modal.querySelector('.modal-creditos-content');
            
            if (wrapper) wrapper.style.cssText = '';
            if (content) content.style.cssText = '';
            
            modal.classList.add('active');
            
            // Forzar reflow
            void modal.offsetHeight;
        }
    }

    cerrarModalDetalleCliente() {
        const modal = document.getElementById('modal-detalle-cliente');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    renderHistorialAbonos() {
        this.renderHistorialAbonosFiltrados(this.abonos);
    }

    renderHistorialAbonosFiltrados(abonos) {
        const tbody = document.getElementById('historial-abonos-body');

        if (abonos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: #6D6D80;">
                        No se encontraron abonos
                    </td>
                </tr>
            `;
            return;
        }

        const formatter = window.currencyFormatter;

        const rows = abonos.map(abono => {
            const fecha = abono.fecha?.toDate ? abono.fecha.toDate() : new Date(abono.fecha);

            return `
                <tr>
                    <td>${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString()}</td>
                    <td><strong>${abono.clienteNombre}</strong></td>
                    <td><span class="folio-badge">${abono.folioVenta}</span></td>
                    <td style="color: #34C759; font-weight: 700;">${formatter ? formatter.format(abono.monto) : '$' + abono.monto.toFixed(2)}</td>
                    <td>${this.getMetodoPagoIcon(abono.metodoPago)} ${this.getMetodoPagoLabel(abono.metodoPago)}</td>
                    <td style="color: #FF3B30;">${formatter ? formatter.format(abono.nuevoSaldo) : '$' + abono.nuevoSaldo.toFixed(2)}</td>
                    <td><span class="estado-badge ${abono.nuevoSaldo === 0 ? 'estado-vigente' : 'estado-vencido'}">${abono.nuevoSaldo === 0 ? 'Liquidada' : 'Pendiente'}</span></td>
                    <td>${abono.recibidoPorNombre}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;
    }

    filtrarHistorial() {
        const searchTerm = document.getElementById('historial-search')?.value.toLowerCase() || '';
        const periodo = document.getElementById('filter-periodo-historial')?.value || 'todo';

        // Filtrar abonos por búsqueda
        let abonosFiltrados = this.abonos.filter(abono => {
            const cliente = (abono.clienteNombre || '').toLowerCase();
            const folio = (abono.folioVenta || '').toLowerCase();
            const search = searchTerm.toLowerCase();

            return cliente.includes(search) || folio.includes(search);
        });

        // Filtrar por período
        if (periodo !== 'todo') {
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            abonosFiltrados = abonosFiltrados.filter(abono => {
                const fechaAbono = abono.fecha?.toDate ? abono.fecha.toDate() : new Date(abono.fecha);
                fechaAbono.setHours(0, 0, 0, 0);

                if (periodo === 'hoy') {
                    return fechaAbono.getTime() === hoy.getTime();
                } else if (periodo === 'semana') {
                    const inicioSemana = new Date(hoy);
                    inicioSemana.setDate(hoy.getDate() - hoy.getDay());
                    return fechaAbono >= inicioSemana;
                } else if (periodo === 'mes') {
                    return fechaAbono.getMonth() === hoy.getMonth() && 
                           fechaAbono.getFullYear() === hoy.getFullYear();
                }
                return true;
            });
        }

        this.renderHistorialAbonosFiltrados(abonosFiltrados);
    }

    renderReportes() {
        const formatter = window.currencyFormatter;

        // Cartera Total
        const carteraTotal = this.ventas.reduce((sum, v) => sum + (v.saldoPendiente || v.total), 0);

        const hoy = new Date();
        const vigente = this.ventas.filter(v => {
            const fecha = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
            const dias = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24));
            return dias <= 30;
        }).reduce((sum, v) => sum + (v.saldoPendiente || v.total), 0);

        const vencido = carteraTotal - vigente;

        // Cobrado del mes
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const cobradoMes = this.abonos.filter(a => {
            const fecha = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha);
            return fecha >= inicioMes;
        }).reduce((sum, a) => sum + (a.monto || 0), 0);

        const numAbonos = this.abonos.filter(a => {
            const fecha = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha);
            return fecha >= inicioMes;
        }).length;

        // Promedio de días (simplificado)
        const promedioDias = 15; // TODO: Calcular real

        // Tasa de recuperación
        const totalOtorgado = this.ventas.reduce((sum, v) => sum + v.total, 0);
        const totalRecuperado = this.ventas.reduce((sum, v) => sum + (v.total - (v.saldoPendiente || v.total)), 0);
        const tasaRecuperacion = totalOtorgado > 0 ? ((totalRecuperado / totalOtorgado) * 100) : 0;

        document.getElementById('reporte-cartera-total').textContent = formatter ? formatter.format(carteraTotal) : '$' + carteraTotal.toFixed(2);
        document.getElementById('reporte-vigente').textContent = formatter ? formatter.format(vigente) : '$' + vigente.toFixed(2);
        document.getElementById('reporte-vencido').textContent = formatter ? formatter.format(vencido) : '$' + vencido.toFixed(2);
        document.getElementById('reporte-cobrado-mes').textContent = formatter ? formatter.format(cobradoMes) : '$' + cobradoMes.toFixed(2);
        document.getElementById('reporte-num-abonos').textContent = numAbonos;
        document.getElementById('reporte-promedio-dias').textContent = `${promedioDias} días`;
        document.getElementById('reporte-tasa-recuperacion').textContent = `${tasaRecuperacion.toFixed(1)}%`;
    }

    getMetodoPagoIcon(metodo) {
        const icons = {
            'efectivo': '💵',
            'tarjeta': '💳',
            'transferencia': '🏦'
        };
        return icons[metodo] || '💰';
    }

    getMetodoPagoLabel(metodo) {
        const labels = {
            'efectivo': 'Efectivo',
            'tarjeta': 'Tarjeta',
            'transferencia': 'Transferencia'
        };
        return labels[metodo] || metodo;
    }

    showLoading() {
        document.getElementById('loading-overlay-creditos').classList.add('active');
    }

    hideLoading() {
        document.getElementById('loading-overlay-creditos').classList.remove('active');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close">✕</button>
            </div>
        `;

        document.body.appendChild(notification);

        notification.querySelector('.notification-close').addEventListener('click', () => notification.remove());
        setTimeout(() => notification.remove(), 5000);
    }

    destroy() {
        console.log(`Módulo ${this.moduleId} descargado`);
    }
}

function loadCreditosModule() {
    window.creditosModule = new CreditosModule();
}

window.loadCreditosModule = loadCreditosModule;
