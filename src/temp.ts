import Gun from "gun";

// Temporary GUN fixes

// PR: Fixed missing Gun.log.once function #961
// https://github.com/amark/gun/pull/961
export const gunLogOnceFix = () => {
    if (!Gun.log.once) {
        Gun.log.once = function(w,s,o){ return ((o = Gun.log.once) as any)[w] = o[w] || 0, o[w]++ || Gun.log(s) };
    }
};
