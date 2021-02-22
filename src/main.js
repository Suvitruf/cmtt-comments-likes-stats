import {Queue} from './queue.js';

const MAX_USERS_TO_SHOW    = 1000;
const COMMENTS_PER_REQUEST = 50;
const REQUESTS_DELAY       = 900;   // апишка позволяет 3 в секунду. Но все мы знаем, как Очоба работает, да?
const REQUEST_COMMENTS_ETA = 3000;  // время выполнения запроса на комменты в районе 1500-4000мс
const REQUEST_COMMENT_ETA  = 100;   // время выполнения запроса на лайки на комменте в районе 50-200мс
const USER_REGEX           = /https:\/\/(.*)\/u\/([0-9]*)/;

const queue = new Queue({period: REQUESTS_DELAY});

function getBaseUrl(site) {
    return `https://api.${site}/v1.8/`
}

function getCommentLikes(site, id) {
    return {
        run: async () => fetch(`${getBaseUrl(site)}comment/likers/${id}`)
    };
}

function getCommentsChunk(site, id, count, offset) {
    return {
        run: async () => fetch(`${getBaseUrl(site)}user/${id}/comments?count=${COMMENTS_PER_REQUEST}&offset=${offset}`)
    };
}

function getProfile(site, id) {
    return {
        run: async () => fetch(`${getBaseUrl(site)}user/${id}`)
    };
}

function loadLikes(site, comments, onLikesProgress, onComplete) {
    const errors     = [];
    const users      = {};
    const totalCount = comments.length;
    let counted      = 0;
    let likes        = 0;
    let dislikes     = 0;

    for (const comment of comments) {
        queue.addTask(getCommentLikes(site, comment.id))
            .then(commentLikers => {
                // console.log(commentLikers);
                if (commentLikers && commentLikers.result) {
                    for (const likerId in commentLikers.result) {
                        if (!commentLikers.result.hasOwnProperty(likerId))
                            continue;
                        if (!users[likerId])
                            users[likerId] = {
                                id:       likerId,
                                likes:    0,
                                dislikes: 0,
                                ava:      commentLikers.result[likerId].avatar_url,
                                name:     commentLikers.result[likerId].name
                            }

                        if (commentLikers.result[likerId].sign === 1) {
                            users[likerId].likes++;
                            likes++;
                        } else {
                            users[likerId].dislikes++;
                            dislikes++;
                        }
                    }
                }

                onLikesProgress({
                    counted: ++counted,
                    count:   totalCount,
                    dislikes,
                    likes,
                    users:   users
                });

                if (counted === totalCount) {
                    if (errors.length)
                        console.error('errors: ', errors);

                    onComplete(users);
                }
            })
            .catch(e => {
                console.error('loadLikes: ', e);
                ++counted
                errors.push({id: comment.id});
            });
    }
}

async function getCommentsLikes(site, id, onCommentsProgress, onLikesProgress, onComplete) {
    let offset          = 0;
    const totalComments = [];
    do {
        try {
            const comments = await queue.addTask(getCommentsChunk(site, id, COMMENTS_PER_REQUEST, offset));

            if (!comments || !comments.result || !comments.result.length)
                break;

            totalComments.push(...comments.result.filter(cmt => cmt.likes.count).map(cmt => {
                return {
                    id: cmt.id
                };
            }));
            offset += comments.result.length;

            onCommentsProgress(offset);
        } catch (e) {
            // на некоторые ренжи Очоба 500 возвращает, сколько бы не пробовал
            // не справляется, видимо, поэтому просто скипаем эти комменты )=
            offset += COMMENTS_PER_REQUEST;
            console.error('getCommentsLikes: ', e);
        }

    } while (true);

    loadLikes(site, totalComments, onLikesProgress, onComplete);
}

function formatTime(secs) {
    const totalMinutes = Math.floor(secs / 60);
    const hours        = Math.floor(totalMinutes / 60);
    const minutes      = totalMinutes - hours * 60;
    const seconds      = Math.floor(secs - hours * 60 * 60 - minutes * 60);

    let resTime;

    if (hours >= 10)
        resTime = hours + ':';
    else
        resTime = '0' + (hours >= 0 ? hours : '0') + ':';

    if (minutes >= 10)
        resTime += minutes + ':';
    else
        resTime += '0' + (minutes >= 0 ? minutes : '0') + ':';

    if (seconds >= 10)
        resTime += seconds;
    else
        resTime += '0' + (seconds >= 0 ? seconds : '0');

    return resTime;
}

function addUser(user, fieldName, list) {
    let added = false;
    for (let i = 0; i < list.length; ++i) {
        if (user[fieldName] > list[i][fieldName]) {
            list.splice(i, 0, user);
            added = true;
            break;
        }
    }

    if (!added)
        list.push(user);
}

function redrawUsers(site, users) {
    const blockLikers        = document.getElementById('block-likers');
    const blockDislikers     = document.getElementById('block-dislikers');
    blockLikers.innerHTML    = '';
    blockDislikers.innerHTML = '';

    const likers    = [];
    const dislikers = [];
    for (const userId in users) {
        if (!users.hasOwnProperty(userId))
            continue;

        const user = users[userId];
        if (user.likes !== 0)
            addUser(user, 'likes', likers);

        if (user.dislikes !== 0)
            addUser(user, 'dislikes', dislikers);
    }

    let likersCounter    = 0;
    let dislikersCounter = 0;

    for (let i = 0; i < Math.min(MAX_USERS_TO_SHOW, likers.length); ++i) {
        const user      = likers[i];
        const userLiker = document.createElement('div');
        userLiker.classList.add('stat-record');


        const userLikerNameBlock = document.createElement('div');
        userLikerNameBlock.classList.add('block-stat-name');

        const userLikerNumber       = document.createElement('span');
        userLikerNumber.innerHTML   = `${++likersCounter}. `;
        const userLikerName         = document.createElement('span');
        const userLikerNameLink     = document.createElement('a');
        userLikerNameLink.href      = `https://${site}/u/${user.id}`;
        userLikerNameLink.innerHTML = `${user.name}`;
        userLikerName.appendChild(userLikerNameLink);

        userLikerNameBlock.appendChild(userLikerNumber);
        userLikerNameBlock.appendChild(userLikerName);


        const userLikerStat     = document.createElement('div');
        userLikerStat.innerHTML = `+${user.likes}`;
        userLikerStat.classList.add('block-stat-likes-count');

        userLiker.appendChild(userLikerNameBlock);
        userLiker.appendChild(userLikerStat);

        blockLikers.appendChild(userLiker);
    }

    for (let i = 0; i < Math.min(MAX_USERS_TO_SHOW, dislikers.length); ++i) {
        const user         = dislikers[i];
        const userDisliker = document.createElement('div');
        userDisliker.classList.add('stat-record');

        const userDislikerNameBlock = document.createElement('div');
        userDislikerNameBlock.classList.add('block-stat-name');

        const userDislikerNumber       = document.createElement('span');
        userDislikerNumber.innerHTML   = `${++dislikersCounter}. `;
        const userDislikerName         = document.createElement('span');
        const userDislikerNameLink     = document.createElement('a');
        userDislikerNameLink.href      = `https://${site}/u/${user.id}`;
        userDislikerNameLink.innerHTML = `${user.name}`;
        userDislikerName.appendChild(userDislikerNameLink);

        userDislikerNameBlock.appendChild(userDislikerNumber);
        userDislikerNameBlock.appendChild(userDislikerName);


        const userDislikerStat     = document.createElement('div');
        userDislikerStat.innerHTML = `-${user.dislikes}`;
        userDislikerStat.classList.add('block-stat-dislikes-count');

        userDisliker.appendChild(userDislikerNameBlock);
        userDisliker.appendChild(userDislikerStat);

        blockDislikers.appendChild(userDisliker);
    }
}


function fillProfileInfo(profile) {
    const ava      = document.getElementById('profile-ava');
    const name     = document.getElementById('profile-name');
    const karma    = document.getElementById('profile-karma');
    const posts    = document.getElementById('profile-posts');
    const comments = document.getElementById('profile-comments');

    ava.src = profile.avatar_url;

    name.innerText = profile.name;
    name.href      = profile.url;

    karma.innerText = `${profile.karma > 0 ? '+' : ''}${profile.karma}`;
    if (profile.karma >= 0)
        karma.classList.add('profile-karma-positive');
    else
        karma.classList.add('profile-karma-negative');

    posts.innerText    = `Статей: ${profile.counters.entries}`;
    comments.innerText = `Комментариев: ${profile.counters.comments}`;
}

async function getInfo(site, id, profile) {
    const totalCommentsText          = document.getElementById('card-comments-progress-total');
    const countedCommentsText        = document.getElementById('card-comments-progress-counted');
    const countedCommentsProgressBar = document.getElementById('card-comments-progress-bar');

    const countedLikesText        = document.getElementById('card-likes-progress-likes');
    const countedDislikesText     = document.getElementById('card-likes-progress-dislikes');
    const countedTotalText        = document.getElementById('card-likes-progress-total');
    const countedLikesProgressBar = document.getElementById('card-likes-progress-bar');

    const countedTimeText = document.getElementById('card-comments-progress-time');
    const errorText       = document.getElementById('error');

    queue.clear();
    queue.start();
    errorText.innerText = '';

    const comments = document.getElementById('profile-comments');

    return getCommentsLikes(site, id, (progress) => {
        if (profile) {
            progress                   = Math.min(progress, profile.counters.comments);
            const totalCommentsSeconds = (profile.counters.comments - progress) / COMMENTS_PER_REQUEST * (REQUESTS_DELAY + REQUEST_COMMENTS_ETA) / 1000;
            comments.innerText         = `Комментариев: ${profile.counters.comments}, обработано ${progress}/${profile.counters.comments}, осталось ${formatTime(totalCommentsSeconds)}`;

            const totalSeconds        = profile.counters.comments * (REQUESTS_DELAY + REQUEST_COMMENT_ETA) / 1000 + totalCommentsSeconds;
            countedTimeText.innerText = `${formatTime(totalSeconds)}`;
        } else {
            comments.innerText = `Обработано ${progress}, хз сколько осталось`;
        }
    }, (progress) => {
        totalCommentsText.innerText            = progress.count;
        countedCommentsText.innerText          = progress.counted;
        countedCommentsProgressBar.style.width = `${progress.counted * 100 / progress.count}%`;

        countedLikesText.innerText          = `${progress.likes}`;
        countedDislikesText.innerText       = `${progress.dislikes}`;
        countedTotalText.innerText          = `${progress.likes + progress.dislikes}`;
        countedLikesProgressBar.style.width = `${progress.likes * 100 / (progress.likes + progress.dislikes)}%`;
        const totalSeconds                  = (progress.count - progress.counted) * REQUESTS_DELAY / 1000;
        countedTimeText.innerText           = `${formatTime(totalSeconds)}`;

        redrawUsers(site, progress.users);
    }, (_) => {
        console.warn('Completed');

        queue.clear();
    });
}

export function onClicked() {
    const errorText = document.getElementById('error');
    const urlText   = document.getElementById('user_url');

    queue.clear();
    queue.start();
    errorText.innerText = '';

    const found = USER_REGEX.exec(urlText.value);
    if (!found || !found.length) {
        errorText.innerText = 'Кривая ссылка';

        return;
    }

    const site = found[1];
    const id   = found[2];

    queue.addTask(getProfile(site, id))
        .then(profile => {
            fillProfileInfo(profile.result);

            return getInfo(site, id, profile.result);
        })
        .catch(e => {
            console.error(e);

            errorText.innerText = `Произошла какая-то хрень: ${e.message} Если в настройках у вас профиль не скрыт, то пинайте Ширяева. А пока попробуем загрузить без профиля.`;
            getInfo(site, id, null);
        });
}
