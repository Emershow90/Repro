import { useState } from 'react';
import { ClipboardList, X, ExternalLink, Loader2, Sparkles, RefreshCw } from 'lucide-react';

interface FormModalFloatingButtonProps {
  formUrl?: string;
}

export default function FormModalFloatingButton({
  formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdIMZqQ2_N7FDheTwynysUK_tcCtZ4ETiUsGmOAFu_V2MFc9w/viewform?usp=dialog'
}: FormModalFloatingButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Full direct form URL for embedding
  const embedUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdIMZqQ2_N7FDheTwynysUK_tcCtZ4ETiUsGmOAFu_V2MFc9w/viewform?embedded=true';

  const handleOpen = () => {
    setIsOpen(true);
    setIsLoading(true);
    setHasError(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <>
      {/* FLOATING ACTION BUTTON */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 group">
        <div className="hidden sm:flex items-center gap-1.5 bg-terminal-bg/90 backdrop-blur border border-terminal-accent/40 text-terminal-accent px-3 py-1.5 rounded-full text-xs font-mono font-bold shadow-lg shadow-black/50 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none transform translate-x-2 group-hover:translate-x-0">
          <Sparkles size={13} className="animate-pulse" />
          <span>Solicitação de Pedido</span>
        </div>

        <button
          onClick={handleOpen}
          aria-label="Abrir Solicitação de Pedido"
          className="relative flex items-center justify-center w-13 h-13 rounded-full bg-terminal-accent text-terminal-bg shadow-xl shadow-terminal-accent/20 hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer group border-2 border-white/20"
        >
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-terminal-accent rounded-full animate-ping opacity-75" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white rounded-full border-2 border-terminal-bg" />
          <ClipboardList size={24} className="text-terminal-bg transition-transform group-hover:rotate-6" />
        </button>
      </div>

      {/* MODAL OVERLAY */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
          {/* MODAL CARD */}
          <div className="relative w-full max-w-4xl h-[90vh] bg-terminal-panel border border-terminal-border/80 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-terminal-bg border-b border-terminal-border/60">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-terminal-accent/10 border border-terminal-accent/30 rounded-md text-terminal-accent">
                  <ClipboardList size={18} />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white tracking-widest uppercase font-mono flex items-center gap-2">
                    <span>Solicitação de Pedido</span>
                    <span className="text-[0.6rem] px-2 py-0.5 bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/30 rounded-full">
                      Online
                    </span>
                  </h3>
                  <p className="text-[0.6rem] text-terminal-text opacity-60 font-mono">
                    {formUrl}
                  </p>
                </div>
              </div>

              {/* HEADER ACTIONS */}
              <div className="flex items-center gap-2">
                <a
                  href={formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider bg-terminal-panel border border-terminal-border text-terminal-text hover:text-white hover:border-terminal-accent/60 rounded-sm cursor-pointer transition-all font-mono"
                  title="Abrir em uma nova aba do navegador"
                >
                  <ExternalLink size={12} className="text-terminal-accent" />
                  <span>Abrir Nova Aba</span>
                </a>

                <button
                  onClick={() => {
                    setIsLoading(true);
                    setHasError(false);
                  }}
                  className="p-1.5 text-terminal-text opacity-70 hover:opacity-100 hover:text-terminal-accent rounded-sm cursor-pointer transition-colors"
                  title="Recarregar Formulário"
                >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                </button>

                <button
                  onClick={handleClose}
                  className="p-1.5 text-terminal-text/70 hover:text-danger hover:bg-danger/10 rounded-md transition-colors cursor-pointer"
                  title="Fechar (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* MODAL BODY WITH LOADING STATE */}
            <div className="relative flex-1 bg-white/5 overflow-hidden flex flex-col">
              
              {/* CARREGAMENTO (MODAL LOADER) */}
              {isLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-terminal-panel/95 backdrop-blur-sm font-mono text-center space-y-4">
                  <div className="relative flex items-center justify-center">
                    <Loader2 size={48} className="text-terminal-accent animate-spin" />
                    <Sparkles size={20} className="absolute text-white animate-pulse" />
                  </div>
                  
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-bold text-white tracking-widest uppercase">
                      Carregamento do Formulário
                    </h4>
                    <p className="text-xs text-terminal-accent animate-pulse">
                      A estabelecer ligação aos servidores da Google...
                    </p>
                  </div>

                  <div className="w-48 h-1.5 bg-terminal-border/50 rounded-full overflow-hidden">
                    <div className="h-full bg-terminal-accent animate-indeterminate" />
                  </div>

                  <p className="text-[0.65rem] text-terminal-text opacity-50 max-w-xs pt-2">
                    Se o formulário demorar a carregar ou exigir login Google, clique no botão abaixo para abrir diretamente.
                  </p>

                  <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-terminal-accent text-terminal-bg hover:bg-white rounded-sm shadow-md cursor-pointer transition-all font-mono"
                  >
                    <ExternalLink size={14} />
                    <span>Abrir Formulário no Navegador</span>
                  </a>
                </div>
              )}

              {/* ERROR STATE */}
              {hasError && !isLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-terminal-panel font-mono text-center space-y-3">
                  <span className="text-3xl">⚠️</span>
                  <h4 className="text-sm font-bold text-danger uppercase">
                    Não foi possível carregar o iframe
                  </h4>
                  <p className="text-xs text-terminal-text opacity-70 max-w-md">
                    O Google Forms pode restringir a exibição dentro de um frame devido a definições de segurança ou autenticação.
                  </p>
                  <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-terminal-accent text-terminal-bg hover:bg-white rounded-sm shadow-lg cursor-pointer transition-all"
                  >
                    <ExternalLink size={16} />
                    <span>Abrir Formulário Diretamente</span>
                  </a>
                </div>
              )}

              {/* IFRAME FORM */}
              <iframe
                src={embedUrl}
                title="Formulário de Solicitação de Pedido"
                className="w-full h-full border-0 rounded-b-lg bg-white"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            </div>

            {/* MODAL FOOTER */}
            <div className="px-5 py-2.5 bg-terminal-bg/90 border-t border-terminal-border/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-[0.65rem] font-mono text-terminal-text opacity-70">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-terminal-accent animate-pulse" />
                <span>Formulário de Solicitação de Pedido</span>
              </span>

              <div className="flex items-center gap-3">
                <a
                  href={formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-terminal-accent hover:underline flex items-center gap-1 font-bold"
                >
                  <span>Abrir diretamente</span>
                  <ExternalLink size={10} />
                </a>
                <button
                  onClick={handleClose}
                  className="px-3 py-1 bg-terminal-panel border border-terminal-border hover:border-terminal-text text-white rounded-sm cursor-pointer transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
