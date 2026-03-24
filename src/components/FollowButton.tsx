import { useState } from 'react';
import { followUser, unfollowUser } from '../api';
import { useToast } from '../context/ToastContext';

interface FollowButtonProps {
  targetUserId: string;
  currentUserId: string;
  initialFollowing: boolean;
  onToggle?: (nowFollowing: boolean) => void;
}

export function FollowButton({ targetUserId, currentUserId, initialFollowing, onToggle }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  if (targetUserId === currentUserId) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      if (following) {
        await unfollowUser(targetUserId);
        setFollowing(false);
        onToggle?.(false);
      } else {
        await followUser(targetUserId);
        setFollowing(true);
        onToggle?.(true);
      }
    } catch {
      showToast('Failed to update follow status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
        following
          ? 'border-white/[0.12] text-rh-light-text dark:text-rh-text hover:border-red-500/30 hover:text-rh-red'
          : 'bg-rh-green border-rh-green text-black hover:bg-green-600'
      } disabled:opacity-50`}
    >
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}
