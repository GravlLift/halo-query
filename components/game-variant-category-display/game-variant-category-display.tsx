import { GameVariantCategory } from 'halo-infinite-api';

export default function GameVariantCategoryDisplay(props: {
  gameVariantCategory: GameVariantCategory;
}): string {
  switch (+props.gameVariantCategory) {
    case GameVariantCategory.MultiplayerSlayer:
      return 'Slayer';
    case GameVariantCategory.MultiplayerOddball:
      return 'Oddball';
    case GameVariantCategory.MultiplayerStrongholds:
      return 'Strongholds';
    case GameVariantCategory.MultiplayerCtf:
      return 'Capture the Flag';
    case GameVariantCategory.MultiplayerKingOfTheHill:
      return 'King of the Hill';
    case GameVariantCategory.MultiplayerExtraction:
      return 'Extraction';
    case GameVariantCategory.MultiplayerLandGrab:
      return 'Land Grab';
    case GameVariantCategory.MultiplayerAttrition:
      return 'Attrition';
    case GameVariantCategory.MultiplayerFiesta:
      return 'Fiesta';
    case GameVariantCategory.MultiplayerGrifball:
      return 'Grifball';
    case GameVariantCategory.MultiplayerInfection:
      return 'Infection';
    case GameVariantCategory.MultiplayerTotalControl:
      return 'Total Control';
    case GameVariantCategory.MultiplayerFirefight:
      return 'Firefight';
    case GameVariantCategory.MultiplayerStockpile:
      return 'Stockpile';
    case GameVariantCategory.MultiplayerMinigame:
      return 'Minigame';
    case GameVariantCategory.MultiplayerElimination:
      return 'Elimination';
    case GameVariantCategory.MultiplayerEscalation:
      return 'Escalation';
    case GameVariantCategory.MultiplayerVIP:
      return 'VIP';
    default:
      return `Unknown (${props.gameVariantCategory})`;
  }
}
