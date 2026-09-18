import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { Button } from './ui';
import { FUNDOS, gerarArteJogador, compartilharArte } from './shareCard';

// Escolha do fundo com previa de verdade: o jogador ve exatamente a imagem que
// vai postar antes de compartilhar, em vez de gerar no escuro e so descobrir
// depois que nao gostou.
export default function ShareArtModal({ player, seasonName, onClose }) {
  const [fundo, setFundo] = useState('classico');
  const [arte, setArte] = useState(null); // { blob, url }
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Guarda a url que esta na tela para soltar da memoria na hora certa: so
  // quando a proxima ja esta pronta (soltar antes deixaria a previa piscando
  // em branco enquanto a nova e desenhada) e ao fechar o modal.
  const urlNaTela = useRef(null);

  useEffect(() => () => {
    if (urlNaTela.current) URL.revokeObjectURL(urlNaTela.current);
  }, []);

  useEffect(() => {
    let cancelado = false;

    setGerando(true);
    gerarArteJogador({ player, seasonName, fundo })
      .then((blob) => {
        // Trocar de fundo rapido dispara varias geracoes: so a ultima vale
        if (cancelado) return;
        const url = URL.createObjectURL(blob);
        if (urlNaTela.current) URL.revokeObjectURL(urlNaTela.current);
        urlNaTela.current = url;
        setArte({ blob, url });
      })
      .catch(() => { if (!cancelado) toast.error('Erro ao gerar a arte'); })
      .finally(() => { if (!cancelado) setGerando(false); });

    return () => { cancelado = true; };
  }, [player, seasonName, fundo]);

  async function compartilhar() {
    if (!arte) return;
    setEnviando(true);
    try {
      const arquivo = `gulag-${player.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      const resultado = await compartilharArte(arte.blob, arquivo);
      if (resultado === 'baixado') toast.success('Arte salva! Agora é só postar.');
      if (resultado === 'compartilhado') onClose();
    } catch (err) {
      toast.error(err.message || 'Erro ao compartilhar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title="Arte para postar" onClose={onClose}>
      <div className="flex flex-wrap gap-1 mb-3">
        {FUNDOS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFundo(f.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium border ${
              fundo === f.key
                ? 'bg-gulag-cyan text-black border-gulag-cyan'
                : 'border-gulag-border text-gray-300 hover:border-gulag-cyan'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <div className="w-[260px] aspect-[1080/1350] rounded border border-gulag-border overflow-hidden bg-gulag-bg flex items-center justify-center">
          {arte ? (
            <img
              src={arte.url}
              alt={`Arte de ${player.name}`}
              className={`w-full h-full object-cover transition-opacity ${gerando ? 'opacity-50' : ''}`}
            />
          ) : (
            <span className="text-xs text-gray-500">Gerando...</span>
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-4">
        <Button variant="secondary" onClick={onClose}>Fechar</Button>
        <Button onClick={compartilhar} disabled={!arte || gerando || enviando}>
          {enviando ? 'Abrindo...' : '📤 Compartilhar'}
        </Button>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        No celular abre o compartilhamento do aparelho (Instagram, WhatsApp...). No computador, baixa a imagem.
      </p>
    </Modal>
  );
}
