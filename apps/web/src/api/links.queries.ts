import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export const linksKeys = {
  preview: (url: string) => ['link-preview', url] as const,
  reader: (url: string) => ['link-reader', url] as const,
};

const HOUR = 60 * 60 * 1000;

export const useLinkPreview = (url: string) =>
  useQuery({
    queryKey: linksKeys.preview(url),
    queryFn: () => api.linkPreview(url),
    staleTime: HOUR,
    retry: false,
  });

export const useLinkReader = (url: string) =>
  useQuery({
    queryKey: linksKeys.reader(url),
    queryFn: () => api.linkPreview(url, true),
    staleTime: HOUR,
    retry: false,
  });
