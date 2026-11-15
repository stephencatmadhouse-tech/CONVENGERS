/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Images and links for files stored in Google Drive. Internal (unpublished)
 * files are fetched with the signed-in user's token; Drive itself is never
 * shared publicly.
 */

import React, { useEffect, useState } from "react";
import { driveObjectUrl, isDriveUrl, openDriveFile } from "./driveClient.ts";

export const SecureImg: React.FC<
  React.ImgHTMLAttributes<HTMLImageElement> & { src?: string }
> = ({ src, alt, ...rest }) => {
  const [url, setUrl] = useState<string | undefined>(
    isDriveUrl(src) ? undefined : src,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (!isDriveUrl(src)) {
      setUrl(src);
      return;
    }
    setUrl(undefined);
    driveObjectUrl(src!)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [src]);
  if (failed)
    return (
      <span
        className="dr-img-missing"
        role="img"
        aria-label={alt || "Image not available"}
      >
        Image not available
      </span>
    );
  if (!url)
    return (
      <span
        className="dr-img-loading"
        role="img"
        aria-label={`Loading ${alt || "image"}`}
      />
    );
  return <img src={url} alt={alt} {...rest} />;
};

export const SecureLink: React.FC<
  React.AnchorHTMLAttributes<HTMLAnchorElement>
> = ({ href, children, ...rest }) =>
  isDriveUrl(href) ? (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        void openDriveFile(href!);
      }}
    >
      {children}
    </a>
  ) : (
    <a href={href} {...rest}>
      {children}
    </a>
  );
