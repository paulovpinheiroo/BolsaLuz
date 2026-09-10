/**
 * scripts/js/admin/crm.js
 * Gestão dinâmica do Kanban CRM, Tabela de Propostas (Stepper) e Tabela de Utilizadores.
 * Atualizado: Integração com o novo Backend para carregamento real do TRASH (Inconsistências) sem páginas vazias.
 */

// ==========================================================================
// 1. LÓGICA DO KANBAN (CRM)
// ==========================================================================
document.addEventListener('DOMContentLoaded', function () {

    // --- ESTADO DA FILA E PROCESSAMENTO ---
    const queue = [];
    const processingIds = new Set();
    const waitingIds = new Set();
    let isQueueRunning = false;
    let currentEditingItem = null;

    // Cache gerado DINAMICAMENTE lendo as colunas direto do HTML PHP
    const dadosPaginaAtual = {};
    const paginacaoPorStatus = {};
    const standardStatuses = [];

    // Função salva-vidas: Remove acentos, pontuações extras e padroniza caixa para comparação segura
    const normalizarString = (str) => {
        return (str || '')
            .toString()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .replace(/[^A-Z0-9\s\.]/g, " ")  // Preserva pontos e limpa caracteres especiais
            .replace(/\s+/g, " ")            // Remove espaços duplos
            .trim();
    };

    // Inicializa o estado lendo dinamicamente as colunas renderizadas pelo PHP
    document.querySelectorAll('.kanban-column').forEach(col => {
        const status = col.getAttribute('data-status');
        if (status) {
            dadosPaginaAtual[status] = [];
            paginacaoPorStatus[status] = { page: 1, total: 1 };

            if (status !== 'TRASH') {
                standardStatuses.push(normalizarString(status));
            }
        }
    });

    // ===== MODO DEMONSTRATIVO (sem backend) =====
    // Dados fixos de exemplo para demonstrar o fluxo do Bolsa Família.
    const DEMO_MODE = true;
    const MOCK_PROPOSAS = [
        { id: 1001, nome: 'Maria da Silva', cpf: '123.456.789-00', telefone: '(11) 98765-4321', nascimento: '1988-04-12', status: 'Aprovada', observacoes: 'Benefício confirmado, dados conferidos.', api_proposta_id: '', json_proposta: { respostas: { recebeBolsaFamilia: 'sim', cadUnicoAtualizado: 'sim', aceitaDesconto: 'sim', receberNaCaixa: 'sim' } } },
        { id: 1002, nome: 'João Pereira', cpf: '234.567.890-11', telefone: '(21) 99876-5432', nascimento: '1990-11-03', status: 'LEAD', observacoes: '', api_proposta_id: '', json_proposta: { respostas: { recebeBolsaFamilia: 'sim', cadUnicoAtualizado: 'nao', aceitaDesconto: 'sim', receberNaCaixa: 'sim' } } },
        { id: 1003, nome: 'Ana Costa', cpf: '345.678.901-22', telefone: '(31) 91234-5678', nascimento: '1975-07-25', status: 'LEAD', observacoes: 'CadÚnico desatualizado há mais de 2 anos.', api_proposta_id: '', json_proposta: { respostas: { recebeBolsaFamilia: 'sim', cadUnicoAtualizado: 'nao', aceitaDesconto: 'nao', receberNaCaixa: 'sim' } } },
        { id: 1004, nome: 'Carlos Santos', cpf: '456.789.012-33', telefone: '(41) 92345-6789', nascimento: '1982-02-18', status: 'Negada', observacoes: 'Não aceita desconto no benefício.', api_proposta_id: '', json_proposta: { respostas: { recebeBolsaFamilia: 'sim', cadUnicoAtualizado: 'sim', aceitaDesconto: 'nao', receberNaCaixa: 'nao' } } },
        { id: 1005, nome: 'Fernanda Lima', cpf: '567.890.123-44', telefone: '(51) 93456-7890', nascimento: '1995-09-30', status: 'TRASH', observacoes: 'Dados inconsistentes: CPF divergente.', api_proposta_id: '', json_proposta: { respostas: { recebeBolsaFamilia: 'sim', cadUnicoAtualizado: 'sim', aceitaDesconto: 'sim', receberNaCaixa: 'nao' } } },
        { id: 1006, nome: 'Roberto Almeida', cpf: '678.901.234-55', telefone: '(61) 94567-8901', nascimento: '1970-12-05', status: 'Cancelada', observacoes: 'Cliente desistiu do crédito.', api_proposta_id: '', json_proposta: { respostas: { recebeBolsaFamilia: 'sim', cadUnicoAtualizado: 'sim', aceitaDesconto: 'sim', receberNaCaixa: 'sim' } } },
        { id: 1007, nome: 'Juliana Rocha', cpf: '789.012.345-66', telefone: '(71) 95678-9012', nascimento: '1992-06-14', status: 'LEAD', observacoes: '', api_proposta_id: '', json_proposta: { respostas: { recebeBolsaFamilia: 'sim', cadUnicoAtualizado: 'sim', aceitaDesconto: 'sim', receberNaCaixa: 'nao' } } }
    ];

    const limitePorPagina = 15;

    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });

    // --- ELEMENTOS CRM ---
    const kanbanBoard = document.getElementById('kanbanBoard');
    const btnAtualizar = document.getElementById('btnAtualizarCRM');
    const filtroBusca = document.getElementById('filtroBuscaCRM');
    const containerFiltro = document.getElementById('containerFiltroCRM');
    const btnToggleFiltro = document.getElementById('btnToggleFiltro');

    const modalNova = document.getElementById('modalNovaPropostaCRM');
    const btnAbrirModalNova = document.getElementById('btnAbrirModalNova');
    const btnFecharModalNova = document.getElementById('btnFecharModalNova');
    const btnVoltarDetalhes = document.getElementById('btnVoltarDetalhes');
    const formProposta = document.getElementById('formProposta');
    const modalTituloPrincipal = modalNova ? modalNova.querySelector('h3') : null;

    const modalDetalhes = document.getElementById('modalDetalhesProposta');
    const btnFecharDetalhes = document.getElementById('btnFecharDetalhes');

    const formatters = {
        cpf: (v) => v ? v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').substring(0, 14) : '',
        telefone: (v) => v ? v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').substring(0, 15) : ''
    };

    // --- 1. INICIALIZAÇÃO ---
    // Apenas executa se estivermos na página do Kanban
    if (kanbanBoard) {
        carregarTodasColunas();
        initNovaPropostaLogic();
        initBatchProcessing();
        initDownloadTrashModal();
        initControlesPaginacaoColunas();
    }

    // --- 2. LÓGICA DE FILTROS ---
    if (btnToggleFiltro) {
        btnToggleFiltro.onclick = () => containerFiltro.classList.toggle('hidden');
    }

    let debounceTimer;
    if (filtroBusca) {
        filtroBusca.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                Object.keys(paginacaoPorStatus).forEach(s => paginacaoPorStatus[s].page = 1);
                carregarTodasColunas();
            }, 500);
        });
    }

    if (btnAtualizar) btnAtualizar.onclick = () => carregarTodasColunas();

    function carregarTodasColunas() {
        Object.keys(paginacaoPorStatus).forEach(status => carregarColunaEspecifica(status));
    }

    function carregarColunaEspecifica(status) {
        const col = document.querySelector(`.kanban-column[data-status="${status}"]`);
        const container = col ? col.querySelector('.cards-container') : null;
        if (!container) return;

        if (container.children.length === 0) {
            container.innerHTML = '<div class="py-10 text-center opacity-30"><i class="fas fa-circle-notch fa-spin text-xl"></i></div>';
        }

        const rawBusca = filtroBusca ? filtroBusca.value.trim() : '';
        const busca = rawBusca.replace(/\s+/g, ' ').trim().toLowerCase();
        const page = paginacaoPorStatus[status].page;

        if (DEMO_MODE) {
            // Filtra os dados fixos por status e por busca (nome ou CPF sem pontuação)
            let dados = MOCK_PROPOSAS.filter(p => p.status === status);
            if (busca) {
                const soDigitos = /^[\d.\-\/]+$/.test(busca);
                dados = dados.filter(p => {
                    if (soDigitos) return (p.cpf || '').replace(/\D/g, '').includes(busca.replace(/\D/g, ''));
                    return (p.nome || '').toLowerCase().includes(busca);
                });
            }

            const total = dados.length;
            const totalPaginas = Math.max(1, Math.ceil(total / limitePorPagina));
            if (page > totalPaginas) paginacaoPorStatus[status].page = totalPaginas;
            const start = (Math.min(page, totalPaginas) - 1) * limitePorPagina;
            const pagina = dados.slice(start, start + limitePorPagina);

            dadosPaginaAtual[status] = pagina;
            renderizarCardsNaColuna(status, pagina);
            atualizarUIPaginacaoColuna(status, { atual: Math.min(page, totalPaginas), paginas: totalPaginas, total });
            return;
        }

        const statusQuery = status;

        const url = `./controller/admin/propostas.php?action=listar&page=${page}&busca=${busca}&limit=${limitePorPagina}&status=${encodeURIComponent(statusQuery)}`;

        fetch(url)
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    // Sem necessidade de esconder cards com JavaScript (resolve o bug das 536 páginas vazias)
                    let dados = res.data;

                    dadosPaginaAtual[status] = dados;
                    renderizarCardsNaColuna(status, dados);
                    atualizarUIPaginacaoColuna(status, res.pagination);
                }
            })
            .catch((err) => {
                console.error("Erro ao carregar coluna " + status, err);
                container.innerHTML = '<div class="py-10 text-center text-red-500 text-[10px] font-bold uppercase tracking-widest"><i class="fas fa-exclamation-triangle mb-2 text-xl"></i><br>Erro no Servidor<br><span class="text-[8px] text-slate-400 mt-1 block lowercase">verificar php</span></div>';
            });
    }

    function renderizarCardsNaColuna(status, propostas) {
        const col = document.querySelector(`.kanban-column[data-status="${status}"]`);
        if (!col) return;
        const container = col.querySelector('.cards-container');
        const badge = col.querySelector('.count-badge');

        const previousScroll = container.scrollTop;

        container.innerHTML = '';
        badge.innerText = propostas.length;
        if (propostas.length === 0) {
            container.innerHTML = '<div class="py-10 text-center opacity-20"><i class="fas fa-inbox text-2xl mb-2"></i><p class="text-[9px] font-black uppercase tracking-widest">Vazio</p></div>';
            return;
        }
        propostas.forEach(p => container.appendChild(createCardElement(p)));

        container.scrollTop = previousScroll;
    }

    function atualizarUIPaginacaoColuna(status, pg) {
        const col = document.querySelector(`.kanban-column[data-status="${status}"]`);
        if (!col) return;
        const info = col.querySelector('.col-page-info');
        const btnPrev = col.querySelector('.btn-col-prev');
        const btnNext = col.querySelector('.btn-col-next');
        paginacaoPorStatus[status].total = pg.paginas;
        if (info) info.innerText = `Pág. ${pg.atual}/${pg.paginas}`;
        if (btnPrev) btnPrev.disabled = pg.atual <= 1;
        if (btnNext) btnNext.disabled = pg.atual >= pg.paginas;
    }

    function initControlesPaginacaoColunas() {
        document.querySelectorAll('.kanban-column').forEach(col => {
            const status = col.getAttribute('data-status');
            if (!paginacaoPorStatus[status]) return;

            const btnPrev = col.querySelector('.btn-col-prev');
            const btnNext = col.querySelector('.btn-col-next');

            if (btnPrev) {
                btnPrev.onclick = () => {
                    if (paginacaoPorStatus[status].page > 1) {
                        paginacaoPorStatus[status].page--;
                        carregarColunaEspecifica(status);
                    }
                };
            }
            if (btnNext) {
                btnNext.onclick = () => {
                    if (paginacaoPorStatus[status].page < paginacaoPorStatus[status].total) {
                        paginacaoPorStatus[status].page++;
                        carregarColunaEspecifica(status);
                    }
                };
            }
        });
    }

    function createCardElement(item) {
        const cpfMask = formatters.cpf(item.cpf);
        const isProcessing = processingIds.has(item.id);
        const isWaiting = waitingIds.has(item.id);

        const progressoVal = parseInt(item.progresso || 0);
        const showProgress = (progressoVal > 0 && progressoVal < 100) || isProcessing;
        const displayProgress = (isProcessing && progressoVal === 0) ? 5 : progressoVal;

        const div = document.createElement('div');
        div.dataset.id = item.id;
        div.className = `bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-azul-400 transition-all group cursor-pointer active:scale-95 relative overflow-hidden`;
        div.onclick = () => openTrelloModal(item);

        let overlayHtml = '';
        if (isProcessing) overlayHtml = `<div class="absolute inset-0 bg-azul-900/5 z-20 flex flex-col items-center justify-center backdrop-blur-[1px] border-2 border-azul-600 rounded-xl pointer-events-none"></div>`;
        else if (isWaiting) overlayHtml = `<div class="absolute inset-0 bg-slate-100/80 dark:bg-slate-900/80 z-20 flex flex-col items-center justify-center backdrop-blur-[1px] border-2 border-dashed border-slate-400 rounded-xl pointer-events-none"><i class="fas fa-clock text-slate-500 text-xl mb-1"></i><span class="text-[9px] font-black uppercase text-slate-500 tracking-widest">Fila</span></div>`;

        let progressHtml = '';
        if (showProgress) {
            progressHtml = `
            <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 mt-3 mb-1 overflow-hidden">
                <div class="bg-azul-600 dark:bg-laranja-500 h-1.5 rounded-full transition-all duration-500 relative" style="width: ${displayProgress}%">
                    <div class="absolute inset-0 bg-white/30 animate-[shimmer_1s_infinite]"></div>
                </div>
            </div>
            <div class="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <span>${isProcessing ? 'Transmitindo...' : 'Processando'}</span>
                <span>${displayProgress}%</span>
            </div>
            `;
        }

        div.innerHTML = `
            ${overlayHtml}
            <div class="flex justify-between items-start mb-2 ${(isProcessing || isWaiting) ? 'opacity-50' : ''}">
                <span class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">#${item.id}</span>
                <div class="flex items-start gap-2">
                     <button class="btn-edit-card text-slate-400 mt-[-6px] hover:text-azul-800 transition-colors" title="Editar"><i class="fas fa-edit text-xs"></i></button>
                     <span class="text-[10px] font-mono font-bold text-azul-800 dark:text-laranja-500">${item.api_proposta_id || 'Local'}</span>
                </div>
            </div>
            <h3 class="text-sm font-extrabold text-slate-800 dark:text-slate-100 line-clamp-1 uppercase tracking-tight">${item.nome}</h3>
            
            ${progressHtml}

            <div class="mt-2 flex items-center justify-between">
                <span class="text-[10px] font-bold text-slate-500">${cpfMask}</span>
                <i class="fas fa-chevron-right text-[10px] text-slate-300"></i>
            </div>`;

        div.querySelector('.btn-edit-card').onclick = (e) => { e.stopPropagation(); openEditModal(item); };
        return div;
    }

    function initBatchProcessing() {
        document.querySelectorAll('.btn-process-column').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const column = btn.closest('.kanban-column');
                const status = column.getAttribute('data-status');
                const propostasNaPagina = dadosPaginaAtual[status] || [];

                if (propostasNaPagina.length === 0) return Toast.fire({ icon: 'warning', title: 'Página sem registos.' });

                Swal.fire({
                    title: 'Processar Página?',
                    text: `Deseja processar os ${propostasNaPagina.length} itens visíveis nesta página?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sim, processar lote',
                    confirmButtonColor: '#1e40af'
                }).then((result) => {
                    if (result.isConfirmed) {
                        propostasNaPagina.forEach(p => addToQueue(p.id, p.nome));
                        Toast.fire({ icon: 'success', title: 'Adicionados à fila!' });
                    }
                });
            };
        });
    }

    function initDownloadTrashModal() {
        const modalDownload = document.getElementById('modalDownloadTrash');
        const btnFechar = document.getElementById('btnFecharModalDownload');
        const formDownload = document.getElementById('formDownloadTrash');
        const inputData = document.getElementById('dataDownloadTrash');

        if (!modalDownload) return;

        // Atribui o evento de abrir modal em todos os botões de download da coluna TRASH
        document.querySelectorAll('.btn-download-today').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();

                // Pega a data atual e formata para 'YYYY-MM-DD' (padrão que o input type="date" aceita)
                const hoje = new Date();
                const ano = hoje.getFullYear();
                const mes = String(hoje.getMonth() + 1).padStart(2, '0');
                const dia = String(hoje.getDate()).padStart(2, '0');

                // Preenche automaticamente com o dia atual
                inputData.value = `${ano}-${mes}-${dia}`;

                // Mostra o modal
                modalDownload.classList.remove('hidden');
            }
        });

        // Eventos para fechar o modal (Botão X ou clicando fora)
        btnFechar.onclick = () => modalDownload.classList.add('hidden');
        modalDownload.onclick = (e) => { if (e.target === modalDownload) modalDownload.classList.add('hidden'); };

        // Submissão do formulário
        formDownload.onsubmit = (e) => {
            e.preventDefault();

            const dataSelecionada = inputData.value; // Vem no formato AAAA-MM-DD

            if (dataSelecionada) {
                // Converte para o formato solicitado: dd-mm-aaaa
                const [ano, mes, dia] = dataSelecionada.split('-');
                const dataFormatada = `${dia}-${mes}-${ano}`;

                // Pega o botão e muda o texto para mostrar que está carregando
                const btnSubmit = formDownload.querySelector('button[type="submit"]');
                const textoOriginalBotao = btnSubmit.innerHTML;
                btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando Download...';
                btnSubmit.disabled = true;

                if (DEMO_MODE) {
                    setTimeout(() => {
                        const linhas = MOCK_PROPOSAS
                            .filter(p => p.status === 'TRASH')
                            .map(p => [p.id, p.nome, p.cpf, (p.observacoes || '')].join(';'));
                        const csv = ['id;nome;cpf;observacoes', ...linhas].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `inconsistencias_${dataFormatada}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        Swal.fire('Sucesso!', 'Seu download foi iniciado.', 'success');
                        modalDownload.classList.add('hidden');
                        btnSubmit.innerHTML = textoOriginalBotao;
                        btnSubmit.disabled = false;
                    }, 400);
                    return;
                }

                const formData = new FormData();
                formData.append('date', dataFormatada);

                fetch('./controller/admin/download_inconsistentes.php', {
                    method: 'POST',
                    body: formData
                })
                    .then(res => {
                        if (!res.ok) throw new Error('Falha no servidor');

                        // IMPORTANTE: Aqui usamos blob() em vez de json() para pegar o arquivo
                        return res.blob();
                    })
                    .then(blob => {
                        // Cria um link temporário na memória do navegador
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;

                        // Define o nome do arquivo que será salvo no computador
                        a.download = `inconsistencias_${dataFormatada}.csv`;

                        // Força o clique no link para iniciar o download
                        document.body.appendChild(a);
                        a.click();

                        // Limpa a memória
                        a.remove();
                        window.URL.revokeObjectURL(url);

                        Swal.fire('Sucesso!', 'Seu download foi iniciado.', 'success');
                        modalDownload.classList.add('hidden'); // Fecha o modal após enviar
                    })
                    .catch(err => {
                        console.error(err);
                        Swal.fire('Erro Técnico', 'Falha ao baixar o arquivo.', 'error');
                    })
                    .finally(() => {
                        // Devolve o botão ao estado normal
                        btnSubmit.innerHTML = textoOriginalBotao;
                        btnSubmit.disabled = false;
                    });
            }
        };
    }

    function openTrelloModal(item) {
        if (!modalDetalhes) return;

        document.getElementById('detalheNomeCliente').innerText = item.nome;
        document.getElementById('detalheIdProposta').innerText = item.id;
        document.getElementById('detalheCpf').innerText = formatters.cpf(item.cpf);
        document.getElementById('detalheApiStatus').innerText = item.api_proposta_id || 'LOCAL';
        document.getElementById('detalheObservacoes').innerText = item.observacoes || 'Sem anotações.';

        let nascimentoFmt = '-';
        if (item.nascimento) {
            const parts = item.nascimento.split('-');
            if (parts.length === 3) {
                nascimentoFmt = `${parts[2]}/${parts[1]}/${parts[0]}`;
            } else {
                nascimentoFmt = item.nascimento;
            }
        }
        document.getElementById('detalheNascimento').innerText = nascimentoFmt;

        const statusBadge = document.getElementById('detalheStatusBadge');
        statusBadge.innerText = (item.status || 'PROPOSTA PENDENTE').replace('_', ' ');

        const obsContainer = document.getElementById('detalheObsContainer');
        if (obsContainer) {
            obsContainer.querySelectorAll('.api-logs-viewer').forEach(el => el.remove());

            const existingOp = document.getElementById('crm-detalhes-operacao-dinamico');
            if (existingOp) existingOp.remove();

            const existingOfertasLive = document.getElementById('crm-detalhes-ofertas-live');
            if (existingOfertasLive) existingOfertasLive.remove();

            if (item.json_proposta) {
                try {
                    const logs = typeof item.json_proposta === 'string' ? JSON.parse(item.json_proposta) : item.json_proposta;

                    let propostaData = null;
                    let rendaPresumida = 0;

                    if (logs.data && logs.data.proposta) {
                        propostaData = logs.data.proposta;
                    } else if (logs.api_response && logs.api_response.data && logs.api_response.data.proposta) {
                        propostaData = logs.api_response.data.proposta;
                    }

                    if (propostaData && propostaData.valorRendaPresumida) {
                        rendaPresumida = propostaData.valorRendaPresumida;
                    }

                    const sectionObs = obsContainer.closest('section');

                    if (propostaData && propostaData.operacao && parseFloat(propostaData.operacao.valorContratado) > 0) {
                        const op = propostaData.operacao;
                        const situacao = propostaData.situacaoDescricao || '-';

                        const htmlOperacao = `
                            <section id="crm-detalhes-operacao-dinamico" class="space-y-4 mb-6 animate-fadeIn">
                                <div class="flex items-center gap-4 mb-4">
                                    <i class="fas fa-file-contract text-lg text-slate-500"></i>
                                    <h3 class="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">Dados da Operação Atual</h3>
                                </div>
                                <div class="md:ml-8 bg-blue-50 dark:bg-blue-900/20 p-5 rounded-lg border border-blue-100 dark:border-blue-800 shadow-sm">
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Produto / Convênio</p>
                                            <p class="text-xs font-bold text-slate-700 dark:text-slate-200 line-clamp-1">${op.produtoNome || '-'} <br> <span class="font-normal text-slate-500">${op.convenioNome || '-'}</span></p>
                                        </div>
                                        <div>
                                            <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Tabela</p>
                                            <p class="text-xs font-bold text-slate-700 dark:text-slate-200 line-clamp-2">${op.tabelaJurosNome || '-'}</p>
                                        </div>
                                        <div>
                                            <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Valor Contratado</p>
                                            <p class="text-sm font-black text-green-600 dark:text-green-400">R$ ${parseFloat(op.valorContratado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div>
                                            <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Parcelas</p>
                                            <p class="text-sm font-bold text-slate-700 dark:text-slate-200">${op.prazo || 0}x de <span class="text-slate-900 dark:text-white">R$ ${parseFloat(op.prestacao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                                        </div>
                                        <div class="sm:col-span-2 pt-3 border-t border-blue-200 dark:border-blue-800 mt-1 flex justify-between items-center">
                                            <div>
                                                <p class="text-[9px] font-black text-slate-400 uppercase mb-0.5">Situação API</p>
                                                <p class="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-tight">${situacao}</p>
                                            </div>
                                            <div class="text-right">
                                                <p class="text-[9px] font-black text-slate-400 uppercase mb-0.5">ID Proposta</p>
                                                <p class="text-xs font-mono text-slate-600 dark:text-slate-400">#${propostaData.id}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        `;
                        if (sectionObs) sectionObs.insertAdjacentHTML('beforebegin', htmlOperacao);
                    }

                    if (item.api_proposta_id && sectionObs) {
                        const htmlOfertasLive = `
                            <section id="crm-detalhes-ofertas-live" class="space-y-4 mb-6 animate-fadeIn">
                                <div class="flex items-center gap-4 mb-4">
                                    <i class="fas fa-search-dollar text-lg text-slate-500"></i>
                                    <h3 class="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">Crédito Disponível</h3>
                                </div>
                                <div class="md:ml-8">
                                    <button id="btnFetchOfertasLive" type="button" class="w-full bg-white dark:bg-slate-800 border border-laranja-300 dark:border-slate-600 hover:border-laranja-400 text-laranja-600 dark:text-laranja-500 font-bold py-3 rounded-lg text-xs transition-all shadow-sm flex items-center justify-center gap-2">
                                        <i class="fas fa-sync-alt"></i> Buscar limites ao vivo na Crefaz
                                    </button>
                                    <div id="resultadoOfertasLive" class="hidden flex-col gap-3 mt-4"></div>
                                </div>
                            </section>
                        `;
                        sectionObs.insertAdjacentHTML('beforebegin', htmlOfertasLive);

                        const btnFetch = document.getElementById('btnFetchOfertasLive');
                        const resultDiv = document.getElementById('resultadoOfertasLive');

                        if (btnFetch) {
                            btnFetch.onclick = async () => {
                                btnFetch.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando a Financeira...';
                                btnFetch.disabled = true;

                                const fd = new FormData();
                                fd.append('cpf', item.cpf.replace(/\D/g, ''));
                                fd.append('propostaId', item.api_proposta_id);

                                let data;
                                try {
                                    const r = await fetch('./controller/cad_proposta/listar_ofertas.php', { method: 'POST', body: fd });
                                    data = await r.json();
                                } catch (e) {
                                    btnFetch.innerHTML = '<i class="fas fa-sync-alt"></i> Erro de Conexão. Tentar Novamente';
                                    btnFetch.disabled = false;
                                    return;
                                }

                                if (!data.success || !data.data?.produtos) {
                                    btnFetch.style.display = 'none';
                                    resultDiv.classList.remove('hidden');
                                    resultDiv.classList.add('flex');
                                    resultDiv.innerHTML = `<div class="p-3 text-center text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
                                        Falha na Crefaz: ${data.message || 'Não foi possível buscar limites.'}
                                    </div>`;
                                    return;
                                }

                                // Coleta todos os combos produto/convenio/tabela/valores que existem
                                const combos = [];
                                data.data.produtos.forEach(prod => {
                                    (prod.convenio || []).forEach(conv => {
                                        (conv.tabelaJuros || []).forEach(tabela => {
                                            const valores = (tabela.tabelaJurosValores || [])
                                                .map(v => parseFloat(v.valor))
                                                .filter(v => v > 0)
                                                .sort((a, b) => b - a); // maior para menor
                                            if (valores.length > 0) {
                                                combos.push({
                                                    produtoId: prod.id,
                                                    produtoNome: prod.nome,
                                                    convenioId: conv.id,
                                                    tabelaId: tabela.id,
                                                    tabelaNome: tabela.nome || 'Tabela Padrão',
                                                    valores
                                                });
                                            }
                                        });
                                    });
                                });

                                if (combos.length === 0) {
                                    btnFetch.style.display = 'none';
                                    resultDiv.classList.remove('hidden');
                                    resultDiv.classList.add('flex');
                                    resultDiv.innerHTML = `<div class="p-3 text-center text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
                                        Nenhum limite disponível para este CPF no momento.
                                    </div>`;
                                    return;
                                }

                                // Mostra tela de verificação enquanto valida
                                btnFetch.style.display = 'none';
                                resultDiv.classList.remove('hidden');
                                resultDiv.classList.add('flex');
                                resultDiv.innerHTML = `
                                    <div class="w-full p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                                        <i class="fas fa-shield-alt text-2xl mb-2 text-azul-600 dark:text-laranja-500 block"></i>
                                        <p class="font-black uppercase tracking-widest text-[10px] mb-1">Verificando limites reais...</p>
                                        <p class="text-[10px] text-slate-400">Confirmando cada valor com a Crefaz antes de exibir</p>
                                        <div id="validacao-progresso" class="mt-3 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                            <div id="validacao-barra" class="bg-azul-600 dark:bg-laranja-500 h-1.5 rounded-full transition-all duration-300" style="width:0%"></div>
                                        </div>
                                    </div>
                                `;

                                // Valida cada combo: testa o maior valor; se passar, esse é o limite real
                                const combosValidados = [];
                                for (let i = 0; i < combos.length; i++) {
                                    const combo = combos[i];

                                    // Atualiza barra de progresso
                                    const pct = Math.round(((i + 1) / combos.length) * 100);
                                    const barra = document.getElementById('validacao-barra');
                                    if (barra) barra.style.width = pct + '%';

                                    // Tenta cada valor do maior ao menor até um passar
                                    let limiteReal = null;
                                    for (const valor of combo.valores) {
                                        const fdSim = new FormData();
                                        fdSim.append('propostaId', item.api_proposta_id);
                                        fdSim.append('produtoId', combo.produtoId);
                                        fdSim.append('convenioId', combo.convenioId);
                                        fdSim.append('tabelaId', combo.tabelaId);
                                        fdSim.append('valor', valor);
                                        fdSim.append('renda', rendaPresumida);

                                        try {
                                            const rSim = await fetch('./controller/cad_proposta/simular_oferta.php', { method: 'POST', body: fdSim });
                                            const resSim = await rSim.json();
                                            if (resSim.success && resSim.data?.prazoValor) {
                                                limiteReal = { valor, prazoValor: resSim.data.prazoValor };
                                                break; // Achou o limite real, para
                                            }
                                            // Se o erro não for de limite/valor, não adianta tentar valores menores
                                            const msg = (resSim.message || '').toLowerCase();
                                            if (!msg.includes('limite') && !msg.includes('400') && !msg.includes('valor')) break;
                                        } catch (e) {
                                            break;
                                        }
                                    }

                                    if (limiteReal) {
                                        combosValidados.push({ ...combo, limiteReal });
                                    }
                                }

                                // Agora monta o HTML só com combos que passaram e só até o limite real
                                if (combosValidados.length === 0) {
                                    resultDiv.innerHTML = `<div class="p-3 text-center text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg w-full">
                                        Nenhum valor aprovado pela Crefaz no momento.
                                    </div>`;
                                    return;
                                }

                                let htmlOpcoes = '';
                                combosValidados.forEach(combo => {
                                    // Filtra só valores <= limiteReal.valor (remove os que a API recusaria)
                                    const valoresValidos = combo.valores.filter(v => v <= combo.limiteReal.valor);
                                    const selectId = `select_oferta_${combo.produtoId}_${combo.convenioId}_${combo.tabelaId}`;

                                    let optionsHtml = valoresValidos.map(v =>
                                        `<option value="${v}">R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</option>`
                                    ).join('');

                                    htmlOpcoes += `
                                    <div class="mb-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-azul-400 dark:hover:border-slate-600 transition-colors">
                                        <div class="flex items-center gap-4">
                                            <div class="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 text-azul-800 dark:text-laranja-500 border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0">
                                                <i class="fas fa-file-invoice-dollar"></i>
                                            </div>
                                            <div>
                                                <h4 class="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">${combo.produtoNome}</h4>
                                                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">${combo.tabelaNome}</p>
                                                <p class="text-[10px] font-bold text-green-600 dark:text-green-400 mt-0.5">
                                                    Limite confirmado: R$ ${combo.limiteReal.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        </div>
                                        <div class="flex flex-col sm:flex-row items-center w-full sm:w-auto gap-2">
                                            <div class="relative w-full sm:w-48">
                                                <select id="${selectId}" class="w-full appearance-none bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-black tracking-tight rounded-xl pl-4 pr-10 py-3 outline-none focus:ring-2 focus:ring-azul-500/20 focus:border-azul-500 transition-all cursor-pointer">
                                                    ${optionsHtml}
                                                </select>
                                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                                                    <i class="fas fa-chevron-down text-[10px]"></i>
                                                </div>
                                            </div>
                                            <button type="button" class="btn-simular-dropdown w-full sm:w-auto bg-azul-800 hover:bg-azul-900 text-white px-5 py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest active:scale-95"
                                                    data-select-id="${selectId}"
                                                    data-produto-id="${combo.produtoId}"
                                                    data-convenio-id="${combo.convenioId}"
                                                    data-tabela-id="${combo.tabelaId}"
                                                    data-tabela-nome="${combo.tabelaNome}"
                                                    data-limite-validado="${combo.limiteReal.valor}"
                                                    data-prazo-valor='${JSON.stringify(combo.limiteReal.prazoValor)}'>
                                                <i class="fas fa-calculator text-[10px]"></i> Simular
                                            </button>
                                        </div>
                                    </div>`;
                                });

                                resultDiv.innerHTML = htmlOpcoes;

                                // Botão simular agora usa os dados já validados (sem nova chamada à API)
                                resultDiv.querySelectorAll('.btn-simular-dropdown').forEach(btn => {
                                    btn.addEventListener('click', async function () {
                                        const selectId = this.dataset.selectId;
                                        const valorSelecionado = parseFloat(document.getElementById(selectId).value);
                                        const valorValidado = parseFloat(this.dataset.limiteValidado); // veja abaixo
                                        const tNome = this.dataset.tabelaNome;

                                        // Se o valor selecionado é o mesmo que foi validado, usa os dados em cache
                                        if (valorSelecionado === valorValidado) {
                                            const prazoValor = JSON.parse(this.dataset.prazoValor);
                                            exibirModalParcelas(prazoValor, valorSelecionado, tNome);
                                            return;
                                        }

                                        // Valor diferente do validado — simula de novo (mas sabemos que vai passar)
                                        Swal.fire({ title: 'Simulando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                                        const fdSim = new FormData();
                                        fdSim.append('propostaId', item.api_proposta_id);
                                        fdSim.append('produtoId', this.dataset.produtoId);
                                        fdSim.append('convenioId', this.dataset.convenioId);
                                        fdSim.append('tabelaId', this.dataset.tabelaId);
                                        fdSim.append('valor', valorSelecionado);
                                        fdSim.append('renda', rendaPresumida);

                                        try {
                                            const r = await fetch('./controller/cad_proposta/simular_oferta.php', { method: 'POST', body: fdSim });
                                            const resSim = await r.json();
                                            if (resSim.success && resSim.data?.prazoValor) {
                                                exibirModalParcelas(resSim.data.prazoValor, valorSelecionado, tNome);
                                            } else {
                                                Swal.fire('Erro', resSim.message || 'Falha ao simular.', 'error');
                                            }
                                        } catch (e) {
                                            Swal.fire('Erro', 'Falha de conexão.', 'error');
                                        }
                                    });
                                });

                                function exibirModalParcelas(prazoValor, valor, tNome) {
                                    let htmlTable = `
                                    <div class="text-left w-full dark:bg-slate-800">
                                        <div class="mb-4 p-3 bg-blue-50 dark:bg-slate-800 rounded-lg border border-blue-100 dark:border-slate-600 shadow-sm">
                                            <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">${tNome}</p>
                                            <p class="text-xl font-black text-green-600 dark:text-green-400">R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div class="max-h-75 overflow-y-auto custom-scroll pr-1">
                                            <div class="grid grid-cols-2 sm:grid-cols-1 gap-2">`;

                                    prazoValor.forEach(pv => {
                                        htmlTable += `<div class="flex justify-between items-center px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm">
                                            <span class="text-[15px] font-bold text-slate-700 dark:text-slate-200">${pv.prazo}x</span>
                                            <span class="text-base font-black text-slate-900 dark:text-white">R$ ${parseFloat(pv.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>`;
                                    });

                                    htmlTable += `</div></div></div>`;

                                    const checkDark = document.documentElement.classList.contains('dark');
                                    Swal.fire({
                                        title: 'Opções de Parcelamento',
                                        background: checkDark ? '#1e293b' : '#ffffff',
                                        color: checkDark ? '#ffffff' : '#1e293b',
                                        html: htmlTable,
                                        showConfirmButton: true,
                                        confirmButtonText: 'Fechar',
                                        confirmButtonColor: '#ea580c',
                                        width: '450px',
                                        didOpen: () => {
                                            const actions = Swal.getActions();
                                            const btn = Swal.getConfirmButton();
                                            if (actions && btn) {
                                                actions.style.padding = '0 1.2em 1.2em';
                                                actions.style.width = '95%';
                                                btn.style.width = '100%';
                                                btn.style.margin = '0';
                                            }
                                        }
                                    });
                                }
                            };
                        }
                    }

                    let time = 'Data n/d';

                    if (logs.timestamp) {
                        time = logs.timestamp;
                    } else if (item.data_criacao) { // Verifica se existe no registro principal do banco
                        time = item.data_criacao;
                    } else if (item.data_cadastro) {
                        time = item.data_cadastro;
                    }
                    const payload = logs.payload_envio ? JSON.stringify(logs.payload_envio, null, 2) : '{}';
                    const response = logs.api_response ? JSON.stringify(logs.api_response, null, 2) : '{}';

                    const htmlLogs = `
                    <div class="api-logs-viewer mt-4 pt-4 border-t border-laranja-200 dark:border-laranja-900/50 text-[10px]">
                        <div class="flex items-center justify-between mb-2">
                            <span class="font-black uppercase tracking-widest text-slate-500 text-[9px]"><i class="fas fa-terminal mr-1"></i> Log Técnico</span>
                            <span class="font-mono text-slate-400 text-[9px]">${time}</span>
                        </div>
                        <div class="space-y-1">
                            <details class="group">
                                <summary class="cursor-pointer font-bold text-azul-800 dark:text-laranja-400 hover:opacity-80 select-none flex items-center gap-2 py-1">
                                    <i class="fas fa-paper-plane w-3"></i> Payload Envio
                                </summary>
                                <pre class="mt-1 p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 overflow-x-auto font-mono text-slate-600 dark:text-slate-400 custom-scroll max-h-40">${payload}</pre>
                            </details>
                            <details class="group">
                                <summary class="cursor-pointer font-bold text-green-700 dark:text-green-400 hover:opacity-80 select-none flex items-center gap-2 py-1">
                                    <i class="fas fa-server w-3"></i> Resposta API
                                </summary>
                                <pre class="mt-1 p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 overflow-x-auto font-mono text-slate-600 dark:text-slate-400 custom-scroll max-h-40">${response}</pre>
                            </details>
                        </div>
                    </div>`;
                    obsContainer.insertAdjacentHTML('beforeend', htmlLogs);
                } catch (e) {
                    console.error("Erro ao renderizar logs JSON", e);
                }
            }
        }

        document.getElementById('detalheBtnSendApi').onclick = () => {
            addToQueue(item.id, item.nome);
            modalDetalhes.classList.add('hidden');
        };

        document.getElementById('detalheBtnEdit').onclick = () => {
            modalDetalhes.classList.add('hidden');
            openEditModal(item);
        };

        document.getElementById('detalheBtnWhats').onclick = () => {
            const tel = item.telefone ? item.telefone.replace(/\D/g, '') : '';
            if (tel) window.open(`https://wa.me/55${tel}`, '_blank');
            else Swal.fire('Erro', 'Telefone não cadastrado', 'error');
        };

        const btnRespostasCad = document.getElementById('detalheBtnRespostasCad');
        const modalRespostasCad = document.getElementById('modalRespostasCad');
        if (btnRespostasCad && modalRespostasCad) {
            btnRespostasCad.onclick = () => {
                const lista = document.getElementById('listaRespostasCad');
                if (lista) {
                    const respostas = coletarRespostasCad(item);
                    if (respostas.length === 0) {
                        lista.innerHTML = '<p class="text-xs text-slate-400 italic">Nenhuma resposta de cadastro registrada.</p>';
                    } else {
                        lista.innerHTML = respostas.join('');
                    }
                }
                modalRespostasCad.classList.remove('hidden');
                modalRespostasCad.classList.add('flex');
                document.body.classList.add('overflow-hidden');
            };
        }
        const btnFecharRespostasCad = document.getElementById('btnFecharRespostasCad');
        if (btnFecharRespostasCad && modalRespostasCad) {
            btnFecharRespostasCad.onclick = () => {
                modalRespostasCad.classList.add('hidden');
                modalRespostasCad.classList.remove('flex');
                document.body.classList.remove('overflow-hidden');
            };
        }

        const btnDelete = document.getElementById('detalheBtnDelete');
        if (btnDelete) {
            btnDelete.onclick = () => {
                Swal.fire({
                    title: 'Arquivar Proposta?',
                    text: "A proposta será movida para a lista de Arquivados (Status: ARQUIVADO).",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Sim, Arquivar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        arquivarProposta(item.id);
                    }
                });
            };
        }

        modalDetalhes.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    }

    const closeTrello = () => { if (modalDetalhes) modalDetalhes.classList.add('hidden'); document.body.classList.remove('overflow-hidden'); };
    if (btnFecharDetalhes) btnFecharDetalhes.onclick = closeTrello;

    const RESPOSTAS_CAD = [
        { chave: 'recebeBolsaFamilia', pergunta: 'Recebe Bolsa Família?' },
        { chave: 'cadUnicoAtualizado', pergunta: 'CadÚnico atualizado?' },
        { chave: 'aceitaDesconto', pergunta: 'Aceita o desconto no benefício?' },
        { chave: 'beneficioPeloMenos400', pergunta: 'Benefício ≥ R$400?' }
    ];

    function coletarRespostasCad(item) {
        let respostasMap = null;
        if (item.json_proposta) {
            try {
                const logs = typeof item.json_proposta === 'string' ? JSON.parse(item.json_proposta) : item.json_proposta;
                if (logs && logs.respostas) respostasMap = logs.respostas;
                else if (logs && logs.data && logs.data.respostas) respostasMap = logs.data.respostas;
                else if (logs && logs.payload_envio && logs.payload_envio.respostas) respostasMap = logs.payload_envio.respostas;
            } catch (e) { respostasMap = null; }
        }
        if (!respostasMap || typeof respostasMap !== 'object') return [];

        return RESPOSTAS_CAD.map(function (r) {
            const valor = respostasMap[r.chave];
            const texto = valor === 'sim' ? 'Sim' : (valor === 'nao' || valor === 'não' ? 'Não' : 'não informado');
            const ok = valor === 'sim';
            return `
                <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                    <span class="text-xs font-bold text-slate-700 dark:text-slate-200">${r.pergunta}</span>
                    <span class="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${ok ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}">${texto}</span>
                </div>`;
        });
    }

    function openEditModal(item) {
        currentEditingItem = item;
        formProposta.reset();
        document.getElementById('prop_id').value = item.id;
        document.getElementById('nome').value = item.nome;
        document.getElementById('cpf').value = formatters.cpf(item.cpf);
        document.getElementById('telefone').value = formatters.telefone(item.telefone);
        if (item.nascimento && item.nascimento.includes('-')) {
            const d = item.nascimento.split('-');
            document.getElementById('nascimento').value = `${d[2]}/${d[1]}/${d[0]}`;
        }
        if (btnVoltarDetalhes) btnVoltarDetalhes.classList.remove('hidden');
        if (modalTituloPrincipal) modalTituloPrincipal.innerText = "Editar Proposta #" + item.id;
        modalNova.classList.remove('hidden');
    }

    function initNovaPropostaLogic() {
        if (!modalNova) return;

        if (btnAbrirModalNova) {
            btnAbrirModalNova.onclick = () => {
                currentEditingItem = null;
                formProposta.reset();
                document.getElementById('prop_id').value = "";
                if (modalTituloPrincipal) modalTituloPrincipal.innerText = "Nova Proposta";
                if (btnVoltarDetalhes) btnVoltarDetalhes.classList.add('hidden');
                modalNova.classList.remove('hidden');
            };
        }

        if (btnFecharModalNova) btnFecharModalNova.onclick = () => modalNova.classList.add('hidden');
        if (btnVoltarDetalhes) btnVoltarDetalhes.onclick = () => { modalNova.classList.add('hidden'); if (currentEditingItem) openTrelloModal(currentEditingItem); };

        const m = (id, fn) => document.getElementById(id)?.addEventListener('input', e => e.target.value = fn(e.target.value));
        m('cpf', formatters.cpf); m('telefone', formatters.telefone);
        m('nascimento', (v) => v.replace(/\D/g, "").substring(0, 8).replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})(\d)/, "$1/$2"));

        formProposta.onsubmit = (e) => {
            e.preventDefault();
            const fd = new FormData(formProposta);
            fd.append('action', 'salvar');
            const nasc = fd.get('nascimento');
            if (nasc && nasc.includes('/')) {
                const p = nasc.split('/');
                fd.set('nascimento', `${p[2]}-${p[1]}-${p[0]}`);
            }

            function salvarLocal() {
                const nome = (fd.get('nome') || '').trim();
                const cpf = (fd.get('cpf') || '').replace(/\D/g, '');
                const telefone = (fd.get('telefone') || '').trim();
                const nascimento = (fd.get('nascimento') || '').trim();
                const idEditado = currentEditingItem ? currentEditingItem.id : null;

                const mascaraCpf = (v) => v ? v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2') : '';

                if (idEditado) {
                    const alvo = MOCK_PROPOSAS.find(p => p.id === idEditado);
                    if (alvo) {
                        alvo.nome = nome;
                        alvo.cpf = mascaraCpf(cpf);
                        alvo.telefone = telefone;
                        alvo.nascimento = nascimento || alvo.nascimento;
                    }
                } else {
                    const novoId = Math.max(0, ...MOCK_PROPOSAS.map(p => p.id)) + 1;
                    MOCK_PROPOSAS.push({
                        id: novoId,
                        nome,
                        cpf: mascaraCpf(cpf),
                        telefone,
                        nascimento,
                        status: 'LEAD',
                        observacoes: '',
                        api_proposta_id: '',
                        json_proposta: { respostas: { recebeBolsaFamilia: 'sim', cadUnicoAtualizado: 'sim', aceitaDesconto: 'sim', receberNaCaixa: 'sim' } }
                    });
                }

                modalNova.classList.add('hidden');
                carregarTodasColunas();
                Toast.fire({ icon: 'success', title: 'Gravado!' });
            }

            if (DEMO_MODE) {
                salvarLocal();
                return;
            }

            fetch('./controller/admin/propostas.php', { method: 'POST', body: fd })
                .then(r => r.json()).then(res => {
                    if (res.success) {
                        modalNova.classList.add('hidden');
                        carregarTodasColunas();
                        Toast.fire({ icon: 'success', title: 'Gravado!' });
                    }
                });
        };
    }

    function addToQueue(id, nome) {
        if (waitingIds.has(id) || processingIds.has(id)) return;
        queue.push({ id, nome });
        waitingIds.add(id);

        const cardEl = document.querySelector(`div[data-id="${id}"]`);
        if (cardEl) {
            const overlay = document.createElement('div');
            overlay.className = "absolute inset-0 bg-slate-100/80 dark:bg-slate-900/80 z-20 flex flex-col items-center justify-center backdrop-blur-[1px] border-2 border-dashed border-slate-400 rounded-xl pointer-events-none";
            overlay.innerHTML = `<i class="fas fa-clock text-slate-500 text-xl mb-1"></i><span class="text-[9px] font-black uppercase text-slate-500 tracking-widest">Fila</span>`;

            if (!cardEl.querySelector('.absolute.inset-0')) {
                cardEl.prepend(overlay);
                const content = cardEl.querySelector('.flex.justify-between');
                if (content) content.classList.add('opacity-50');
            }
        }

        carregarTodasColunas();
        processNextInQueue();
    }

    async function processNextInQueue() {
        if (isQueueRunning || queue.length === 0) return;
        isQueueRunning = true;
        const currentItem = queue.shift();
        waitingIds.delete(currentItem.id);
        processingIds.add(currentItem.id);
        try { await enviarPropostaApiExec(currentItem.id, currentItem.nome); }
        finally {
            processingIds.delete(currentItem.id);
            isQueueRunning = false;
            carregarTodasColunas();
            processNextInQueue();
        }
    }

    function enviarPropostaApiExec(id, nome) {
        return new Promise(resolve => {
            if (DEMO_MODE) {
                setTimeout(() => {
                    const alvo = MOCK_PROPOSAS.find(p => p.id === id);
                    if (alvo) {
                        alvo.status = 'Aprovada';
                        alvo.observacoes = 'Processado em modo demonstração.';
                    }
                    Toast.fire({ icon: 'success', title: nome, text: 'Processado (demo)' });
                    resolve();
                }, 1200);
                return;
            }
            const fd = new FormData(); fd.append('id', id);
            fetch('./controller/cad_proposta/cad_proposta.php', { method: 'POST', body: fd })
                .then(r => r.json()).then(res => {
                    Toast.fire({ icon: res.success ? 'success' : 'error', title: nome, text: res.message });
                    resolve();
                }).catch(() => resolve());
        });
    }

    function arquivarProposta(id) {
        if (DEMO_MODE) {
            const alvo = MOCK_PROPOSAS.find(p => p.id === id);
            if (alvo) {
                alvo.status = 'Cancelada';
                alvo.observacoes = (alvo.observacoes ? alvo.observacoes + ' ' : '') + 'Arquivado em modo demonstração.';
            }
            if (modalDetalhes) modalDetalhes.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
            carregarTodasColunas();
            Toast.fire({ icon: 'success', title: 'Arquivado com sucesso!' });
            return;
        }
        const fd = new FormData();
        fd.append('action', 'arquivar');
        fd.append('id', id);

        fetch('./controller/admin/propostas.php', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    if (modalDetalhes) modalDetalhes.classList.add('hidden');
                    document.body.classList.remove('overflow-hidden');
                    carregarTodasColunas();
                    Toast.fire({ icon: 'success', title: 'Arquivado com sucesso!' });
                } else {
                    Toast.fire({ icon: 'error', title: 'Erro', text: res.message });
                }
            })
            .catch(() => Toast.fire({ icon: 'error', title: 'Erro de conexão' }));
    }

    function showLoader(show) { if (typeof loader !== 'undefined' && loader) loader.classList.toggle('hidden', !show); }
});

// ==========================================================================
// 3. LÓGICA DA TABELA DE UTILIZADORES (tabelaUsuarios)
// ==========================================================================
document.addEventListener('DOMContentLoaded', function () {

    const tabelaBody = document.getElementById('tabelaUsuarios');
    const inputBusca = document.getElementById('inputBusca');
    const btnNovo = document.getElementById('btnNovoUsuario');
    const modal = document.getElementById('modalUsuario');
    const btnFecharModal = document.getElementById('btnFecharModal');
    const btnCancelar = document.getElementById('btnCancelar');
    const formUsuario = document.getElementById('formUsuario');
    const modalTitulo = document.getElementById('modalTitulo');

    if (!tabelaBody && !formUsuario) return;

    let paginaAtual = 1;
    let totalPaginas = 1;
    const btnAnterior = document.getElementById('btnPagAnterior');
    const btnProximo = document.getElementById('btnPagProximo');
    const infoPaginacao = document.getElementById('infoPaginacao');

    let timeoutBusca = null;

    carregarUsuarios();

    if (inputBusca) {
        inputBusca.addEventListener('input', () => {
            clearTimeout(timeoutBusca);
            timeoutBusca = setTimeout(() => {
                paginaAtual = 1;
                carregarUsuarios();
            }, 500);
        });
    }

    if (btnAnterior) {
        btnAnterior.addEventListener('click', () => {
            if (paginaAtual > 1) {
                paginaAtual--;
                carregarUsuarios();
            }
        });
    }

    if (btnProximo) {
        btnProximo.addEventListener('click', () => {
            if (paginaAtual < totalPaginas) {
                paginaAtual++;
                carregarUsuarios();
            }
        });
    }

    if (btnNovo) btnNovo.addEventListener('click', () => abrirModal());
    if (btnFecharModal) btnFecharModal.addEventListener('click', () => fecharModal());
    if (btnCancelar) btnCancelar.addEventListener('click', () => fecharModal());
    window.addEventListener('click', (e) => { if (e.target === modal) fecharModal(); });

    if (formUsuario) {
        formUsuario.addEventListener('submit', function (e) {
            e.preventDefault();
            salvarUsuario();
        });
    }

    function carregarUsuarios() {
        const busca = inputBusca ? inputBusca.value : '';
        const url = `./controller/admin/usuarios.php?action=listar&page=${paginaAtual}&busca=${encodeURIComponent(busca)}`;

        if (tabelaBody) tabelaBody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><i class="fas fa-spinner fa-spin text-[#0056b3]"></i> Carregando...</td></tr>';

        fetch(url)
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    renderizarTabela(res.data);
                    atualizarPaginacao(res.pagination);
                } else {
                    if (tabelaBody) tabelaBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">${res.message}</td></tr>`;
                }
            })
            .catch(err => {
                console.error(err);
                if (tabelaBody) tabelaBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-500">Erro de conexão.</td></tr>';
            });
    }

    function renderizarTabela(usuarios) {
        if (!tabelaBody) return;
        tabelaBody.innerHTML = '';

        if (usuarios.length === 0) {
            tabelaBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum usuário encontrado.</td></tr>';
            return;
        }

        usuarios.forEach(u => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-gray-200 hover:bg-gray-50";
            tr.innerHTML = `
                <td class="px-5 py-4 text-sm text-gray-900">${u.id}</td>
                <td class="px-5 py-4 text-sm font-bold text-gray-700">${u.nome}</td>
                <td class="px-5 py-4 text-sm text-gray-600">${u.email}</td>
                <td class="px-5 py-4 text-sm text-gray-500">${new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
                <td class="px-5 py-4 text-sm text-right">
                    <button class="text-blue-600 hover:text-blue-900 mr-3 btn-editar" data-id="${u.id}" data-nome="${u.nome}" data-email="${u.email}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-red-600 hover:text-red-900 btn-excluir" data-id="${u.id}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tabelaBody.appendChild(tr);
        });

        document.querySelectorAll('#tabelaUsuarios .btn-editar').forEach(btn => {
            btn.addEventListener('click', () => abrirModal(btn.dataset));
        });

        document.querySelectorAll('#tabelaUsuarios .btn-excluir').forEach(btn => {
            btn.addEventListener('click', () => confirmarExclusao(btn.dataset.id));
        });
    }

    function atualizarPaginacao(pg) {
        totalPaginas = pg.paginas;
        paginaAtual = pg.atual;
        if (infoPaginacao) infoPaginacao.innerText = `Página ${paginaAtual} de ${totalPaginas} (Total: ${pg.total})`;

        if (btnAnterior) {
            btnAnterior.disabled = paginaAtual <= 1;
            btnAnterior.classList.toggle('opacity-50', paginaAtual <= 1);
        }

        if (btnProximo) {
            btnProximo.disabled = paginaAtual >= totalPaginas;
            btnProximo.classList.toggle('opacity-50', paginaAtual >= totalPaginas);
        }
    }

    function abrirModal(dados = null) {
        if (formUsuario) formUsuario.reset();
        const msgSenha = document.getElementById('msgSenha');

        if (dados) {
            if (modalTitulo) modalTitulo.innerText = "Editar Usuário";
            if (document.getElementById('userId')) document.getElementById('userId').value = dados.id;
            if (document.getElementById('userNome')) document.getElementById('userNome').value = dados.nome;
            if (document.getElementById('userEmail')) document.getElementById('userEmail').value = dados.email;
            if (document.getElementById('userSenha')) document.getElementById('userSenha').required = false;
            if (msgSenha) msgSenha.innerText = "Preencha apenas se quiser alterar a senha.";
        } else {
            if (modalTitulo) modalTitulo.innerText = "Novo Usuário";
            if (document.getElementById('userId')) document.getElementById('userId').value = "";
            if (document.getElementById('userSenha')) document.getElementById('userSenha').required = true;
            if (msgSenha) msgSenha.innerText = "Obrigatória para novos usuários.";
        }
        if (modal) modal.classList.remove('hidden');
    }

    function fecharModal() {
        if (modal) modal.classList.add('hidden');
    }

    function salvarUsuario() {
        const formData = new FormData(formUsuario);
        formData.append('action', 'salvar');

        fetch('./controller/admin/usuarios.php', {
            method: 'POST',
            body: formData
        })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    Swal.fire('Sucesso!', res.message, 'success');
                    fecharModal();
                    carregarUsuarios();
                } else {
                    Swal.fire('Erro', res.message, 'error');
                }
            })
            .catch(err => {
                Swal.fire('Erro Técnico', 'Falha ao salvar.', 'error');
            });
    }

    function confirmarExclusao(id) {
        Swal.fire({
            title: 'Tem certeza?',
            text: "Esta ação não pode ser desfeita.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, excluir'
        }).then((result) => {
            if (result.isConfirmed) {
                const formData = new FormData();
                formData.append('action', 'excluir');
                formData.append('id', id);

                fetch('./controller/admin/usuarios.php', {
                    method: 'POST',
                    body: formData
                })
                    .then(res => res.json())
                    .then(res => {
                        if (res.success) {
                            Swal.fire('Excluído!', res.message, 'success');
                            carregarUsuarios();
                        } else {
                            Swal.fire('Erro', res.message, 'error');
                        }
                    });
            }
        });
    }
});