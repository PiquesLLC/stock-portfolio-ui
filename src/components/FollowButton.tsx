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
        await unfollowUser(targetUserId, currentUserId);
        setFollowing(false);
        onToggle?.(false);
      } else {
        await followUser(targetUserId, currentUserId);
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
      className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
        following
          ? 'bg-rh-light-border dark:bg-rh-border text-rh-light-text dark:text-rh-text hover:bg-red-500/20 hover:text-rh-red'
          : 'bg-rh-green text-black hover:bg-green-600'
      } disabled:opacity-50`}
    >
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}
