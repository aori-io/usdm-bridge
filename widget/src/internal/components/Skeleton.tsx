import type React from 'react';

const Skeleton = (props: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className="flex animate-pulse">
      <div {...props} />
    </div>
  );
};

export default Skeleton;
