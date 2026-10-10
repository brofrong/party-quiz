export function EditorScreen({ onClose }: { quizId: string; onClose: () => void }) {
  return (
    <button type="button" onClick={onClose}>
      Назад
    </button>
  );
}
