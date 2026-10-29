import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getMonetization, type OfferStatus, type RewardedOffer } from '../../../shared/monetization';
import { GameState } from '../game/types';

/**
 * Cola entre a Disparada e a camada de monetização. O jogo não conhece a
 * rede de anúncios: só pede "posso começar a próxima?" e "ofereça o revive".
 */
export const corridaAds = getMonetization('corrida');

interface Args {
  state: GameState;
  /** runId da partida em andamento (identifica a oferta de revive). */
  liveRunId: number;
  lastChance: boolean;
  sound: boolean;
  start: () => void;
  reviveWithReward: () => boolean;
  suspendAudio: () => void;
}

const NO_OFFER: OfferStatus = 'unavailable';

export function useCorridaAds({ state, liveRunId, lastChance, sound, start, reviveWithReward, suspendAudio }: Args) {
  const ads = corridaAds;

  useEffect(() => {
    ads.init();
  }, [ads]);
  useEffect(() => {
    ads.setSound(sound);
  }, [ads, sound]);

  // Partida concluída (uma vez por runId, mesmo com re-renderizações).
  useEffect(() => {
    if (state === GameState.GAME_OVER && liveRunId > 0) ads.runCompleted(`run:${liveRunId}`);
  }, [ads, state, liveRunId]);

  const hooks = useRef({ onAdStart: () => suspendAudio() });
  hooks.current.onAdStart = () => suspendAudio();
  const adHooks = useRef({ onAdStart: () => hooks.current.onAdStart() }).current;

  // --- intersticial na transição "jogar de novo" ---
  const [restarting, setRestarting] = useState(false);
  const restartingRef = useRef(false);
  const startRef = useRef(start);
  startRef.current = start;
  /** Joga de novo; se for hora, o intersticial aparece antes (sobre a tela de resultado). */
  const playAgain = useCallback(async () => {
    if (restartingRef.current) return; // cliques/teclas repetidos
    restartingRef.current = true;
    setRestarting(true);
    try {
      await ads.beforeNextRun(adHooks);
    } catch {
      /* publicidade nunca impede a próxima partida */
    } finally {
      restartingRef.current = false;
      setRestarting(false);
      startRef.current();
    }
  }, [ads, adHooks]);

  // --- revive com anúncio (tela de última chance) ---
  const [offer, setOffer] = useState<RewardedOffer | null>(null);
  useEffect(() => {
    if (state === GameState.CONTINUE && lastChance && liveRunId > 0) {
      setOffer(ads.offerReward(`revive:${liveRunId}`, adHooks));
    } else {
      setOffer((o) => {
        // Saiu da última chance sem ver: a oferta expira (o anúncio já na tela não é afetado).
        o?.cancel();
        return null;
      });
    }
  }, [ads, adHooks, state, lastChance, liveRunId]);

  const subscribe = useCallback((fn: () => void) => offer?.subscribe(fn) ?? (() => {}), [offer]);
  const offerStatus = useSyncExternalStore(subscribe, () => offer?.status ?? NO_OFFER);

  const reviveRef = useRef(reviveWithReward);
  reviveRef.current = reviveWithReward;
  /** O jogador escolheu ver o anúncio. Revive só com recompensa confirmada pela rede. */
  const watchAdToContinue = useCallback(async () => {
    if (!offer || offer.status !== 'ready') return;
    const result = await offer.show();
    if (result === 'rewarded' && offer.claim()) reviveRef.current();
  }, [offer]);

  return {
    adsActive: ads.active,
    playAgain,
    restarting,
    offerStatus,
    watchAdToContinue,
  };
}
