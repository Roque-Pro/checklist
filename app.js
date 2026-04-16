// Laudo de Inspeção Veicular - Com IA Gemini
class LaudoApp {
    constructor() {
        this.sidePhotos = { left: null, right: null, front: null, back: null };
        this.docProprietarioPhoto = null;
        this.checklistStatus = {};
        this.checklistItems = [];
        this.proprietarioData = {};
        this.vehicleData = {};
        this.DRAFT_KEY = 'laudo_current';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupSignatureCanvases();
        this.loadDraft();
    }

    // ═══════════════════════════════════════
    // EVENT LISTENERS
    // ═══════════════════════════════════════
    setupEventListeners() {
        // Foto documento proprietário
        document.getElementById('btnFotoDocProprietario').addEventListener('click', () => {
            document.getElementById('photoDocProprietario').click();
        });
        document.getElementById('photoDocProprietario').addEventListener('change', (e) => this.handleDocProprietarioPhoto(e));
        document.getElementById('btnAnalisarProprietario').addEventListener('click', () => this.analyzeProprietarioDoc());
        document.getElementById('manualProprietario').addEventListener('click', () => this.showManualProprietario());

        // Fotos do veículo
        document.querySelectorAll('.btn-photo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const side = e.target.dataset.side;
                document.getElementById(`photo${side.charAt(0).toUpperCase() + side.slice(1)}`).click();
            });
        });
        document.querySelectorAll('.photo-input').forEach(input => {
            input.addEventListener('change', (e) => this.handleVehiclePhoto(e));
        });
        document.getElementById('btnAnalisarVeiculo').addEventListener('click', () => this.analyzeVehicle());
        document.getElementById('manualVeiculo').addEventListener('click', () => this.showManualVehicle());

        // Ação
        document.getElementById('saveDraftBtn').addEventListener('click', () => this.saveDraft());
        document.getElementById('loadDraftBtn').addEventListener('click', () => this.clearForm());
        document.getElementById('generatePdfBtn').addEventListener('click', () => this.generatePDF());

        // Auto-save nos campos fixos
        ['operador', 'observations', 'companyName'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.autoSave());
            }
        });
    }

    // ═══════════════════════════════════════
    // PROPRIETÁRIO - FOTO + IA
    // ═══════════════════════════════════════
    handleDocProprietarioPhoto(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            this.docProprietarioPhoto = ev.target.result;
            document.getElementById('previewDocProprietario').innerHTML = `<img src="${ev.target.result}" alt="Documento">`;
            document.getElementById('btnAnalisarProprietario').style.display = '';
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    async analyzeProprietarioDoc() {
        if (!this.docProprietarioPhoto) return;
        const loading = document.getElementById('loadingProprietario');
        const btn = document.getElementById('btnAnalisarProprietario');
        btn.style.display = 'none';
        loading.classList.add('active');

        try {
            const base64 = this.docProprietarioPhoto.split(',')[1];
            const mimeType = this.docProprietarioPhoto.split(';')[0].split(':')[1];

            const prompt = `Analise esta foto de documento de identificação (RG, CNH ou similar) e extraia as informações.
Retorne APENAS um JSON válido sem markdown, sem \`\`\`, neste formato exato:
{"nome":"NOME COMPLETO","rg":"NUMERO DO RG","cpf":"NUMERO DO CPF SE VISIVEL"}
Se não conseguir ler algum campo, coloque string vazia.`;

            const result = await this.callGemini(prompt, [{ base64, mimeType }]);
            const data = this.parseJSON(result);

            this.proprietarioData = data;
            this.renderProprietarioFields(data);
        } catch (error) {
            this.showMessage('Erro ao analisar documento: ' + error.message, 'error');
            btn.style.display = '';
        } finally {
            loading.classList.remove('active');
        }
    }

    renderProprietarioFields(data) {
        const container = document.getElementById('proprietarioFields');
        container.innerHTML = `
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">Nome Completo</label>
                    <input type="text" id="propNome" class="input-field" value="${data.nome || ''}" placeholder="Nome">
                </div>
                <div class="form-field">
                    <label class="field-label">RG</label>
                    <input type="text" id="propRG" class="input-field" value="${data.rg || ''}" placeholder="RG">
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">CPF</label>
                    <input type="text" id="propCPF" class="input-field" value="${data.cpf || ''}" placeholder="CPF">
                </div>
            </div>`;
        container.querySelectorAll('.input-field').forEach(el => {
            el.addEventListener('input', () => this.autoSave());
        });
        this.autoSave();
    }

    showManualProprietario() {
        const container = document.getElementById('proprietarioFields');
        const btn = document.getElementById('manualProprietario');
        if (container.innerHTML.trim()) {
            container.innerHTML = '';
            btn.textContent = '✏️ Preencher Manualmente';
            btn.classList.remove('active');
            return;
        }
        this.renderProprietarioFields({ nome: '', rg: '', cpf: '' });
        btn.textContent = '✖ Fechar Campos Manuais';
        btn.classList.add('active');
    }

    // ═══════════════════════════════════════
    // VEÍCULO - FOTOS + IA
    // ═══════════════════════════════════════
    handleVehiclePhoto(e) {
        const file = e.target.files[0];
        if (!file) return;
        const side = e.target.dataset.side;
        const reader = new FileReader();
        reader.onload = (ev) => {
            this.sidePhotos[side] = ev.target.result;
            this.displayPhotoPreview(side);
            this.autoSave();
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    displayPhotoPreview(side) {
        const previewId = `photoPreview${side.charAt(0).toUpperCase() + side.slice(1)}`;
        const preview = document.getElementById(previewId);
        if (!preview) return;
        if (this.sidePhotos[side]) {
            preview.innerHTML = `<img src="${this.sidePhotos[side]}" alt="Foto ${side}">`;
        } else {
            preview.innerHTML = '';
        }
    }

    async analyzeVehicle() {
        const missing = [];
        const labels = { left: 'Lateral Esquerda', right: 'Lateral Direita', front: 'Frente', back: 'Traseira' };
        Object.entries(this.sidePhotos).forEach(([side, val]) => {
            if (!val) missing.push(labels[side]);
        });
        if (missing.length > 0) {
            this.showModal(`Faltam ${missing.length} foto(s):\n\n• ${missing.join('\n• ')}`);
            return;
        }
        const photos = Object.entries(this.sidePhotos).filter(([, v]) => v);

        const loading = document.getElementById('loadingVeiculo');
        const btn = document.getElementById('btnAnalisarVeiculo');
        btn.style.display = 'none';
        loading.classList.add('active');

        try {
            const images = photos.map(([, dataUrl]) => ({
                base64: dataUrl.split(',')[1],
                mimeType: dataUrl.split(';')[0].split(':')[1]
            }));

            const prompt = `Analise estas fotos de um veículo. Identifique o veículo e extraia informações.
Retorne APENAS um JSON válido sem markdown, sem \`\`\`, neste formato exato:
{
  "placa":"PLACA DO VEICULO",
  "marca":"MARCA",
  "modelo":"MODELO",
  "cor":"COR",
  "ano_aproximado":"ANO APROXIMADO",
  "checklist":[
    "Faróis","Lanternas Traseiras","Retrovisor Esquerdo","Retrovisor Direito",
    "Para-choque Dianteiro","Para-choque Traseiro","Rodas","Pneus",
    "Vidro Dianteiro","Vidro Traseiro","Antena","Escapamento"
  ]
}

IMPORTANTE sobre o checklist:
- Inclua APENAS itens que este modelo específico de veículo possui.
- Sempre inclua itens básicos: Faróis, Lanternas, Retrovisores, Para-choques, Rodas, Pneus, Vidros, Motor Funciona, Cinto de Segurança, Buzina, Extintor, Macaco, Triângulo, Chave de Roda, Estepe.
- Inclua itens específicos se o veículo tiver: Antena no Teto, Engate, Calhas de Chuva, Teto Solar, Rack de Teto, Sensor de Estacionamento, Câmera de Ré, Ar Condicionado, Airbag, etc.
- NÃO inclua itens que o veículo claramente não possui (ex: DVD/Monitor para carros populares).
Se não conseguir identificar algum campo, coloque string vazia.`;

            const result = await this.callGemini(prompt, images);
            const data = this.parseJSON(result);

            this.vehicleData = data;
            this.renderVehicleFields(data);
            if (data.checklist && data.checklist.length > 0) {
                this.renderChecklist(data.checklist);
            }
        } catch (error) {
            this.showMessage('Erro ao analisar veículo: ' + error.message, 'error');
            btn.style.display = '';
        } finally {
            loading.classList.remove('active');
        }
    }

    renderVehicleFields(data) {
        const container = document.getElementById('vehicleFields');
        container.innerHTML = `
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">Placa</label>
                    <input type="text" id="veiPlaca" class="input-field" value="${data.placa || ''}" placeholder="ABC-1234" maxlength="8">
                </div>
                <div class="form-field">
                    <label class="field-label">Cor</label>
                    <input type="text" id="veiCor" class="input-field" value="${data.cor || ''}" placeholder="Cor">
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">Marca</label>
                    <input type="text" id="veiMarca" class="input-field" value="${data.marca || ''}" placeholder="Marca">
                </div>
                <div class="form-field">
                    <label class="field-label">Modelo</label>
                    <input type="text" id="veiModelo" class="input-field" value="${data.modelo || ''}" placeholder="Modelo">
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">Ano Aproximado</label>
                    <input type="text" id="veiAno" class="input-field" value="${data.ano_aproximado || ''}" placeholder="Ano">
                </div>
                <div class="form-field">
                    <label class="field-label">Combustível</label>
                    <select id="veiFuel" class="input-field">
                        <option value="">Selecione</option>
                        <option value="vazio">Vazio</option>
                        <option value="1/4">1/4</option>
                        <option value="1/2">1/2</option>
                        <option value="3/4">3/4</option>
                        <option value="cheio">Cheio</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-field">
                    <label class="field-label">KM</label>
                    <input type="number" id="veiKM" class="input-field" placeholder="Quilometragem">
                </div>
                <div class="form-field">
                    <label class="field-label">Conservação</label>
                    <select id="veiConservacao" class="input-field">
                        <option value="">Selecione</option>
                        <option value="bom">Bom</option>
                        <option value="regular">Regular</option>
                        <option value="riscado">Riscado</option>
                    </select>
                </div>
            </div>`;
        container.querySelectorAll('.input-field').forEach(el => {
            el.addEventListener('input', () => this.autoSave());
            el.addEventListener('change', () => this.autoSave());
        });
        this.autoSave();
    }

    renderChecklist(items) {
        this.checklistItems = items;
        this.checklistStatus = {};
        const container = document.getElementById('checklistContainer');
        let html = '<h3>Checklist de Componentes</h3><div class="checklist-grid">';
        items.forEach((item, i) => {
            const key = `item_${i}`;
            html += `<div class="checklist-item">
                <label>${item}</label>
                <div class="status-buttons">
                    <button type="button" class="status-btn" data-item="${key}" data-status="ok">OK</button>
                    <button type="button" class="status-btn" data-item="${key}" data-status="avaria">Avaria</button>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleStatusClick(e));
        });
    }

    handleStatusClick(e) {
        const btn = e.target;
        const item = btn.dataset.item;
        const status = btn.dataset.status;
        document.querySelectorAll(`[data-item="${item}"]`).forEach(b => {
            b.classList.remove('ok', 'avaria');
        });
        btn.classList.add(status);
        this.checklistStatus[item] = status;
        this.autoSave();
    }

    showManualVehicle() {
        const vContainer = document.getElementById('vehicleFields');
        const cContainer = document.getElementById('checklistContainer');
        const btn = document.getElementById('manualVeiculo');
        if (vContainer.innerHTML.trim()) {
            vContainer.innerHTML = '';
            cContainer.innerHTML = '';
            this.checklistItems = [];
            this.checklistStatus = {};
            btn.textContent = '✏️ Preencher Manualmente';
            btn.classList.remove('active');
            return;
        }
        this.renderVehicleFields({ placa: '', marca: '', modelo: '', cor: '', ano_aproximado: '' });
        const defaultChecklist = [
            'Faróis', 'Lanternas Traseiras', 'Retrovisor Esquerdo', 'Retrovisor Direito',
            'Para-choque Dianteiro', 'Para-choque Traseiro', 'Rodas', 'Pneus',
            'Vidro Dianteiro', 'Vidro Traseiro', 'Antena', 'Engate',
            'Ar Condicionado', 'Airbag', 'Cinto de Segurança', 'Buzina',
            'Extintor', 'Macaco', 'Triângulo', 'Chave de Roda', 'Estepe',
            'Motor Funciona', 'Câmbio', 'Chave de Ignição',
            'Forrações/Estofados', 'Tapete', 'Rádio'
        ];
        this.renderChecklist(defaultChecklist);
        btn.textContent = '✖ Fechar Campos Manuais';
        btn.classList.add('active');
    }

    // ═══════════════════════════════════════
    // GEMINI API
    // ═══════════════════════════════════════
    async callGemini(prompt, images) {
        const apiKey = CONFIG.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'COLE_SUA_CHAVE_AQUI') {
            throw new Error('Configure sua chave da API Gemini no arquivo config.js');
        }

        const parts = [];
        parts.push({ text: prompt });

        images.forEach(img => {
            parts.push({
                inline_data: {
                    mime_type: img.mimeType,
                    data: img.base64
                }
            });
        });

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048
                    }
                })
            }
        );

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`API Gemini erro ${response.status}: ${err}`);
        }

        const json = await response.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Resposta vazia da IA');
        return text;
    }

    parseJSON(text) {
        // Remove markdown code fences se houver
        let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        return JSON.parse(clean);
    }

    // ═══════════════════════════════════════
    // SIGNATURE CANVASES
    // ═══════════════════════════════════════
    setupSignatureCanvases() {
        ['sigOperador', 'sigProprietario'].forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;

            let isDrawing = false;

            const setupCanvas = () => {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            };

            const getPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                return {
                    x: (e.clientX || e.touches?.[0]?.clientX) - rect.left,
                    y: (e.clientY || e.touches?.[0]?.clientY) - rect.top
                };
            };

            canvas.addEventListener('mousedown', (e) => {
                isDrawing = true;
                const pos = getPos(e);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
            });
            canvas.addEventListener('mouseup', () => { isDrawing = false; this.autoSave(); });
            canvas.addEventListener('mousemove', (e) => {
                if (!isDrawing) return;
                const pos = getPos(e);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
            });
            canvas.addEventListener('touchstart', (e) => {
                isDrawing = true;
                const pos = getPos(e);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
            });
            canvas.addEventListener('touchend', () => { isDrawing = false; this.autoSave(); });
            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (!isDrawing) return;
                const pos = getPos(e);
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
            });

            setupCanvas();

            const clearBtnId = `clear${canvasId.charAt(0).toUpperCase() + canvasId.slice(1)}`;
            document.getElementById(clearBtnId).addEventListener('click', () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                setupCanvas();
                this.autoSave();
            });
        });
    }

    // ═══════════════════════════════════════
    // FORM DATA
    // ═══════════════════════════════════════
    getFormData() {
        const safeVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.toUpperCase() : '';
        };

        return {
            companyName: safeVal('companyName'),
            operador: safeVal('operador'),
            propNome: safeVal('propNome'),
            propRG: safeVal('propRG'),
            propCPF: safeVal('propCPF'),
            veiPlaca: safeVal('veiPlaca'),
            veiMarca: safeVal('veiMarca'),
            veiModelo: safeVal('veiModelo'),
            veiCor: safeVal('veiCor'),
            veiAno: safeVal('veiAno'),
            veiFuel: safeVal('veiFuel'),
            veiKM: document.getElementById('veiKM')?.value || '',
            veiConservacao: safeVal('veiConservacao'),
            observations: safeVal('observations'),
            checklistItems: this.checklistItems,
            checklistStatus: this.checklistStatus,
            sidePhotos: this.sidePhotos,
            docProprietarioPhoto: this.docProprietarioPhoto,
            signatures: {
                operador: document.getElementById('sigOperador').toDataURL(),
                proprietario: document.getElementById('sigProprietario').toDataURL()
            },
            timestamp: new Date().toISOString()
        };
    }

    // ═══════════════════════════════════════
    // SAVE / LOAD / CLEAR
    // ═══════════════════════════════════════
    saveDraft() {
        try {
            const data = this.getFormData();
            localStorage.setItem(this.DRAFT_KEY, JSON.stringify(data));
            this.showMessage('Salvo com sucesso!', 'success');
        } catch (error) {
            this.showMessage('Erro ao salvar: ' + error.message, 'error');
        }
    }

    autoSave() {
        try {
            const data = this.getFormData();
            sessionStorage.setItem(this.DRAFT_KEY, JSON.stringify(data));
        } catch (e) { /* silent */ }
    }

    loadDraft() {
        try {
            const data = JSON.parse(localStorage.getItem(this.DRAFT_KEY));
            if (!data) return;

            if (data.companyName) document.getElementById('companyName').value = data.companyName;
            if (data.operador) document.getElementById('operador').value = data.operador;
            if (data.observations) document.getElementById('observations').value = data.observations;

            // Proprietário
            if (data.propNome || data.propRG || data.propCPF) {
                this.renderProprietarioFields({ nome: data.propNome || '', rg: data.propRG || '', cpf: data.propCPF || '' });
            }
            if (data.docProprietarioPhoto) {
                this.docProprietarioPhoto = data.docProprietarioPhoto;
                document.getElementById('previewDocProprietario').innerHTML = `<img src="${data.docProprietarioPhoto}" alt="Documento">`;
            }

            // Veículo
            if (data.veiPlaca || data.veiMarca || data.veiModelo) {
                this.renderVehicleFields({
                    placa: data.veiPlaca || '', marca: data.veiMarca || '', modelo: data.veiModelo || '',
                    cor: data.veiCor || '', ano_aproximado: data.veiAno || ''
                });
                // Restaurar selects
                if (data.veiFuel) { const el = document.getElementById('veiFuel'); if (el) el.value = data.veiFuel; }
                if (data.veiKM) { const el = document.getElementById('veiKM'); if (el) el.value = data.veiKM; }
                if (data.veiConservacao) { const el = document.getElementById('veiConservacao'); if (el) el.value = data.veiConservacao; }
            }

            // Checklist
            if (data.checklistItems && data.checklistItems.length > 0) {
                this.renderChecklist(data.checklistItems);
                if (data.checklistStatus) {
                    this.checklistStatus = data.checklistStatus;
                    Object.entries(data.checklistStatus).forEach(([item, status]) => {
                        const btn = document.querySelector(`[data-item="${item}"][data-status="${status}"]`);
                        if (btn) btn.classList.add(status);
                    });
                }
            }

            // Fotos veículo
            if (data.sidePhotos) {
                this.sidePhotos = data.sidePhotos;
                Object.keys(this.sidePhotos).forEach(side => this.displayPhotoPreview(side));
                if (Object.values(this.sidePhotos).some(p => p)) {
                    document.getElementById('btnAnalisarVeiculo').style.display = '';
                }
            }
        } catch (error) {
            console.error('Erro ao carregar draft:', error);
        }
    }

    clearForm() {
        if (!confirm('Deseja limpar todos os dados e começar um novo laudo?')) return;

        document.getElementById('operador').value = '';
        document.getElementById('observations').value = '';

        // Limpar proprietário
        this.docProprietarioPhoto = null;
        document.getElementById('previewDocProprietario').innerHTML = '';
        document.getElementById('proprietarioFields').innerHTML = '';
        document.getElementById('btnAnalisarProprietario').style.display = 'none';

        // Limpar veículo
        this.sidePhotos = { left: null, right: null, front: null, back: null };
        ['left', 'right', 'front', 'back'].forEach(side => this.displayPhotoPreview(side));
        document.getElementById('vehicleFields').innerHTML = '';
        document.getElementById('checklistContainer').innerHTML = '';
        document.getElementById('btnAnalisarVeiculo').style.display = 'none';

        // Limpar assinaturas
        ['sigOperador', 'sigProprietario'].forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            canvas.width = canvas.width;
        });

        this.checklistStatus = {};
        this.checklistItems = [];
        this.proprietarioData = {};
        this.vehicleData = {};
        localStorage.removeItem(this.DRAFT_KEY);
        this.showMessage('Novo laudo pronto para preenchimento', 'success');
    }

    // ═══════════════════════════════════════
    // GERAR PDF
    // ═══════════════════════════════════════
    async generatePDF() {
        try {
            if (!window.jspdf && !window.jsPDF) await this.loadJsPDF();

            const data = this.getFormData();
            let jsPDFConstructor;
            if (window.jspdf && window.jspdf.jsPDF) jsPDFConstructor = window.jspdf.jsPDF;
            else if (window.jsPDF && window.jsPDF.jsPDF) jsPDFConstructor = window.jsPDF.jsPDF;
            else if (window.jsPDF) jsPDFConstructor = window.jsPDF;
            else throw new Error('jsPDF não carregado');

            const doc = new jsPDFConstructor({ orientation: 'p', unit: 'mm', format: 'a4' });
            let y = 0;
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - margin * 2;
            const col2X = margin + contentWidth / 2 + 3;
            const halfWidth = contentWidth / 2 - 3;
            const timestamp = new Date(data.timestamp).toLocaleString('pt-BR');

            const azulEscuro = [30, 58, 138];
            const cinzaClaro = [243, 244, 246];
            const cinzaBorda = [209, 213, 219];
            const verdeOk = [22, 163, 74];
            const vermelhoAvaria = [220, 38, 38];
            const branco = [255, 255, 255];
            const preto = [50, 50, 50];

            const checkPage = (needed) => {
                if (y + needed > pageHeight - 20) { doc.addPage(); y = 15; }
            };

            const drawSectionTitle = (title) => {
                checkPage(30);
                doc.setFillColor(...azulEscuro);
                doc.roundedRect(margin, y, contentWidth, 9, 2, 2, 'F');
                doc.setTextColor(...branco);
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text(title, margin + 4, y + 6.5);
                y += 13;
            };

            const drawFieldRow = (label, value, x, width) => {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...azulEscuro);
                doc.text(label, x, y);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...preto);
                doc.text(value || '—', x, y + 5);
                doc.setDrawColor(...cinzaBorda);
                doc.setLineWidth(0.3);
                doc.line(x, y + 7, x + width, y + 7);
            };

            const drawFooter = () => {
                const total = doc.internal.getNumberOfPages();
                for (let i = 1; i <= total; i++) {
                    doc.setPage(i);
                    doc.setDrawColor(...cinzaBorda);
                    doc.setLineWidth(0.5);
                    doc.line(margin, pageHeight - 12, margin + contentWidth, pageHeight - 12);
                    doc.setFontSize(7);
                    doc.setTextColor(150, 150, 150);
                    doc.setFont('helvetica', 'italic');
                    doc.text(`Documento gerado em: ${timestamp}`, margin, pageHeight - 8);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`Página ${i} de ${total}`, margin + contentWidth - 20, pageHeight - 8);

                    const whatsLink = 'https://wa.me/5532991075164';
                    const whatsText = 'Tenha seu checklist inteligente';
                    doc.setFontSize(6);
                    doc.setTextColor(180, 180, 180);
                    doc.setFont('helvetica', 'italic');
                    const wtWidth = doc.getTextWidth(whatsText);
                    const wtX = margin + (contentWidth - wtWidth) / 2;
                    const wtY = pageHeight - 4;
                    doc.textWithLink(whatsText, wtX, wtY, { url: whatsLink });
                }
            };

            // HEADER
            doc.setFillColor(...azulEscuro);
            doc.rect(0, 0, pageWidth, 36, 'F');
            doc.setFillColor(220, 38, 38);
            doc.rect(0, 36, pageWidth, 3, 'F');
            doc.setTextColor(...branco);
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text(data.companyName || 'IGUAÇU REBOQUE', margin, 16);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'normal');
            doc.text('LAUDO DE INSPEÇÃO VEICULAR', margin, 25);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.text(timestamp, margin + contentWidth - doc.getTextWidth(timestamp), 32);
            y = 46;

            // OPERADOR
            drawSectionTitle('OPERADOR DO REBOQUE');
            drawFieldRow('OPERADOR', data.operador, margin, contentWidth);
            y += 14;

            // PROPRIETÁRIO
            drawSectionTitle('DADOS DO PROPRIETÁRIO');
            drawFieldRow('NOME COMPLETO', data.propNome, margin, contentWidth);
            y += 12;
            drawFieldRow('RG', data.propRG, margin, halfWidth);
            drawFieldRow('CPF', data.propCPF, col2X, halfWidth);
            y += 14;

            // VEÍCULO
            drawSectionTitle('DADOS DO VEÍCULO');
            drawFieldRow('PLACA', data.veiPlaca, margin, halfWidth);
            drawFieldRow('COR', data.veiCor, col2X, halfWidth);
            y += 12;
            drawFieldRow('MARCA', data.veiMarca, margin, halfWidth);
            drawFieldRow('MODELO', data.veiModelo, col2X, halfWidth);
            y += 12;
            drawFieldRow('ANO', data.veiAno, margin, halfWidth);
            drawFieldRow('COMBUSTÍVEL', data.veiFuel, col2X, halfWidth);
            y += 12;
            drawFieldRow('QUILOMETRAGEM', data.veiKM ? `${data.veiKM} KM` : '—', margin, halfWidth);
            drawFieldRow('CONSERVAÇÃO', data.veiConservacao, col2X, halfWidth);
            y += 14;

            // CHECKLIST
            if (data.checklistItems && data.checklistItems.length > 0) {
                drawSectionTitle('CHECKLIST DE COMPONENTES');
                doc.setFillColor(...azulEscuro);
                doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F');
                doc.setTextColor(...branco);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text('COMPONENTE', margin + 4, y + 5.5);
                doc.text('STATUS', margin + contentWidth - 30, y + 5.5);
                y += 10;

                data.checklistItems.forEach((item, index) => {
                    checkPage(10);
                    const key = `item_${index}`;
                    const status = data.checklistStatus[key] || '';

                    if (index % 2 === 0) {
                        doc.setFillColor(...cinzaClaro);
                        doc.rect(margin, y - 4, contentWidth, 8, 'F');
                    }

                    doc.setTextColor(...preto);
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.text(item.toUpperCase(), margin + 4, y);

                    if (status === 'ok') {
                        doc.setFillColor(...verdeOk);
                        doc.roundedRect(margin + contentWidth - 35, y - 4, 22, 7, 2, 2, 'F');
                        doc.setTextColor(...branco);
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'bold');
                        doc.text('OK', margin + contentWidth - 28, y);
                    } else if (status === 'avaria') {
                        doc.setFillColor(...vermelhoAvaria);
                        doc.roundedRect(margin + contentWidth - 35, y - 4, 22, 7, 2, 2, 'F');
                        doc.setTextColor(...branco);
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'bold');
                        doc.text('AVARIA', margin + contentWidth - 33, y);
                    } else {
                        doc.setTextColor(150, 150, 150);
                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'italic');
                        doc.text('N/A', margin + contentWidth - 28, y);
                    }
                    y += 8;
                });
                y += 5;
            }

            // OBSERVAÇÕES
            if (data.observations) {
                drawSectionTitle('OBSERVAÇÕES');
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...preto);
                const obsLines = doc.splitTextToSize(data.observations, contentWidth - 10);
                const obsHeight = obsLines.length * 5 + 8;
                checkPage(obsHeight + 5);
                doc.setFillColor(255, 253, 235);
                doc.setDrawColor(234, 179, 8);
                doc.setLineWidth(0.5);
                doc.roundedRect(margin, y - 2, contentWidth, obsHeight, 2, 2, 'FD');
                doc.text(obsLines, margin + 5, y + 4);
                y += obsHeight + 5;
            }

            // FOTOS
            const sideLabels = { left: 'LATERAL ESQUERDA', right: 'LATERAL DIREITA', front: 'FRENTE', back: 'TRASEIRA' };
            const photoSides = Object.keys(data.sidePhotos).filter(s => data.sidePhotos[s]);
            if (photoSides.length > 0) {
                drawSectionTitle('REGISTRO FOTOGRÁFICO');
                const photoWidth = (contentWidth - 6) / 2;
                const photoHeight = 55;
                let photosInRow = 0;
                let photoX = margin;

                photoSides.forEach(side => {
                    checkPage(photoHeight + 15);
                    try {
                        doc.setDrawColor(...cinzaBorda);
                        doc.setLineWidth(0.5);
                        doc.roundedRect(photoX, y, photoWidth, photoHeight + 8, 2, 2, 'S');
                        doc.setFillColor(...azulEscuro);
                        doc.roundedRect(photoX + 2, y + 1, photoWidth - 4, 6, 1, 1, 'F');
                        doc.setTextColor(...branco);
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.text(sideLabels[side], photoX + 4, y + 5);
                        doc.addImage(data.sidePhotos[side], 'JPEG', photoX + 2, y + 9, photoWidth - 4, photoHeight - 2);
                        photoX += photoWidth + 6;
                        photosInRow++;
                        if (photosInRow >= 2) {
                            y += photoHeight + 12;
                            photoX = margin;
                            photosInRow = 0;
                        }
                    } catch (e) { console.error('Erro foto:', e); }
                });
                if (photosInRow > 0) y += photoHeight + 12;
                y += 3;
            }

            // TERMO
            drawSectionTitle('TERMO DE AUTORIZAÇÃO');
            const termoTexto = 'Autorizo a empresa a efetuar os reparos necessários no veículo acima descrito, isentando-a de qualquer responsabilidade por objetos pessoais deixados no interior do veículo. Declaro estar ciente das condições do veículo conforme descrito neste laudo de inspeção.';
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...preto);
            const termoLines = doc.splitTextToSize(termoTexto, contentWidth - 10);
            const termoHeight = termoLines.length * 4.5 + 8;
            checkPage(termoHeight + 5);
            doc.setFillColor(239, 246, 255);
            doc.setDrawColor(...azulEscuro);
            doc.setLineWidth(0.5);
            doc.roundedRect(margin, y - 2, contentWidth, termoHeight, 2, 2, 'FD');
            doc.text(termoLines, margin + 5, y + 4);
            y += termoHeight + 5;

            // ASSINATURAS
            checkPage(65);
            drawSectionTitle('ASSINATURAS');
            const sigWidth = halfWidth - 5;
            const sigHeight = 25;

            doc.setDrawColor(...cinzaBorda);
            doc.setLineWidth(0.5);
            doc.roundedRect(margin, y, sigWidth + 10, sigHeight + 18, 2, 2, 'S');
            try {
                if (data.signatures.operador?.indexOf('base64') > -1) {
                    doc.addImage(data.signatures.operador, 'PNG', margin + 5, y + 2, sigWidth, sigHeight);
                }
            } catch (e) {}
            doc.setDrawColor(...azulEscuro);
            doc.setLineWidth(0.8);
            doc.line(margin + 5, y + sigHeight + 4, margin + sigWidth + 5, y + sigHeight + 4);
            doc.setTextColor(...azulEscuro);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('OPERADOR DO REBOQUE', margin + 5, y + sigHeight + 10);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(120, 120, 120);
            doc.text('Assinatura', margin + 5, y + sigHeight + 14);

            doc.setDrawColor(...cinzaBorda);
            doc.roundedRect(col2X, y, sigWidth + 10, sigHeight + 18, 2, 2, 'S');
            try {
                if (data.signatures.proprietario?.indexOf('base64') > -1) {
                    doc.addImage(data.signatures.proprietario, 'PNG', col2X + 5, y + 2, sigWidth, sigHeight);
                }
            } catch (e) {}
            doc.setDrawColor(...azulEscuro);
            doc.setLineWidth(0.8);
            doc.line(col2X + 5, y + sigHeight + 4, col2X + sigWidth + 5, y + sigHeight + 4);
            doc.setTextColor(...azulEscuro);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('PROPRIETÁRIO DO VEÍCULO', col2X + 5, y + sigHeight + 10);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(120, 120, 120);
            doc.text('Assinatura', col2X + 5, y + sigHeight + 14);

            drawFooter();

            const filename = `Laudo_${data.propNome || 'SemNome'}_${data.veiMarca || ''}_${Date.now()}.pdf`;
            doc.save(filename);
            this.showMessage('PDF gerado com sucesso!', 'success');
        } catch (error) {
            this.showMessage('Erro ao gerar PDF: ' + error.message, 'error');
            console.error('PDF error:', error);
        }
    }

    loadJsPDF() {
        return new Promise((resolve, reject) => {
            if (window.jspdf || window.jsPDF) { resolve(); return; }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => setTimeout(resolve, 200);
            script.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
            document.head.appendChild(script);
        });
    }

    showModal(text) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-box">
            <p>${text.replace(/\n/g, '<br>')}</p>
            <button class="modal-close">Entendi</button>
        </div>`;
        overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    showMessage(text, type) {
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.textContent = text;
        const container = document.querySelector('.form-container');
        container.insertBefore(msg, container.firstChild);
        setTimeout(() => msg.remove(), 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => { new LaudoApp(); });
