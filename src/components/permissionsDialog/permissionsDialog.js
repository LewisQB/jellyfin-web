import dom from '../../scripts/dom';
import dialogHelper from '../dialogHelper/dialogHelper';
import loading from '../loading/loading';
import layoutManager from '../layoutManager';
import globalize from '../../lib/globalize';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-select/emby-select';
import 'material-design-icons-iconfont';
import '../formdialog.scss';
import ServerConnections from '../ServerConnections';
import toast from '../toast/toast';
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api';
import { toApi } from 'utils/jellyfin-apiclient/compat';

function getEditorHeaderHtml() {
    let html = '';

    html += '<div class="formDialogContent smoothScrollY" style="padding-top:2em;">';
    html += '<div class="dialogContentInner dialog-content-centered">';
    html += '<form style="margin:auto;">';

    html += '<div class="fldSelectPlaylist selectContainer">';
    html += '<select is="emby-select" id="selectViewPermissions" label="' + globalize.translate('SetVisibility') + '">';
    html += '<option value="private">' + globalize.translate('MakePrivate') + '</option>';
    html += '<option value="public">' + globalize.translate('MakePublic') + '</option>';
    html += '</select>';
    html += '</div>';

    html += '<div class="fieldDescription">';
    html += globalize.translate('PlaylistPublicPrivateInfo');
    html += '</div>';

    return html;
}

function getEditorFooterHtml() {
    let html = '';
    html += '<input type="hidden" class="fldSelectedItemIds" />';

    html += '<br />';
    html += '<div class="formDialogFooter">';
    html += '<button is="emby-button" type="submit" class="raised btnSubmit block formDialogFooterItem button-submit">' + globalize.translate('Confirm') + '</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';
    html += '</div>';

    return html;
}

function getUserPermssionHtml(user) {
    let html = '';
    html += '<div class="userPermissions USER' + user.Id + '">';
    html += '<div class="userPermissionHeader">';
    html += user.Name;
    html += '</div>';

    html += '<label class="checkboxContainer fldViewPermissions">';
    html += '<input type="checkbox" is="emby-checkbox" class="chkViewPermissions" />';
    html += '<span>' + globalize.translate('ViewPermissions') + '</span>';
    html += '</label>';

    html += '<label class="checkboxContainer fldEditPermissions">';
    html += '<input type="checkbox" is="emby-checkbox" class="chkEditPermissions" />';
    html += '<span>' + globalize.translate('EditPermissions') + '</span>';
    html += '</label>';
    html += '</div>';
    return html;
}

function centerFocus(elem, horiz, on) {
    import('../../scripts/scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

function onSubmit(e) {
    loading.show();

    const instance = this;
    const dlg = dom.parentWithClass(e.target, 'dialog');
    const options = instance.options;

    const apiClient = ServerConnections.getApiClient(options.serverId);

    const replaceAllMetadata = dlg.querySelector('#selectViewPermissions').value === 'all';

    const mode = dlg.querySelector('#selectViewPermissions').value === 'private' ? 'Default' : 'FullRefresh';

    options.itemIds.forEach(function (itemId) {
        apiClient.refreshItem(itemId, {
            Recursive: true,
            ImageRefreshMode: mode,
            MetadataRefreshMode: mode,
            ReplaceAllMetadata: replaceAllMetadata
        });
    });

    dialogHelper.close(dlg);

    toast(globalize.translate('PreferencesUpdated'));

    loading.hide();

    e.preventDefault();
    return false;
}

// Permissions Dialog for individual playlist permissions
class PermissionsDialog {
    constructor(options) {
        this.options = options;
        this.itemId = this.options.itemIds[0];
        this.serverId = this.options.serverId;
        this.apiClient = ServerConnections.getApiClient(this.serverId);
        this.playlistApi = getPlaylistsApi(toApi(this.apiClient));
    }

    // Gets a list of all users then also gets their permissions for this playlist
    async getAllUsers() {
        const allUsers = await this.apiClient.getUsers();
        if (allUsers != 'undefined') {
            if (allUsers.length === 0) {
                return null;
            } else {
                for (const user of allUsers) {
                    user.permissions = { CanEdit: (await this.playlistApi.getPlaylistUser({ playlistId: this.itemId, userId: user.Id })).data.CanEdit };
                }
            }
        } else {
            return null;
        }
        const currentUser = await this.apiClient.getCurrentUser();
        return allUsers.filter((user) => user.Id !== currentUser.Id);
    }

    async show() {
        const dialogOptions = {
            removeOnClose: true,
            scrollY: false
        };

        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        } else {
            dialogOptions.size = 'small';
        }

        const dlg = dialogHelper.createDialog(dialogOptions);

        dlg.classList.add('formDialog');

        let html = '';
        const title = globalize.translate('EditPermissions');

        html += '<div class="formDialogHeader">';
        html += `<button is="paper-icon-button-light" class="btnCancel autoSize" tabindex="-1" title="${globalize.translate('ButtonBack')}"><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
        html += '<h3 class="formDialogHeaderTitle">';
        html += title;
        html += '</h3>';
        html += '</div>';
        html += getEditorHeaderHtml();

        const updateUserPermissions = (user, canView, canEdit = false) => {
            if (canView) {
                user.permissions = { CanEdit: canEdit };
            } else {
                user.permissions = null;
            }
            const playlistIsPublic = dlg.querySelector('#selectViewPermissions').value === 'public';
            if (!canView && !playlistIsPublic) {
                dlg.querySelector('.USER' + user.Id).querySelector('.chkEditPermissions').classList.add('hide');
            } else {
                dlg.querySelector('.USER' + user.Id).querySelector('.chkEditPermissions').classList.remove('hide');
            }
        };

        const submitUserPermissions = async (user) => {
            const permissions = user.permissions;
            if (permissions != null && permissions.CanEdit === true) {
                await this.playlistApi.updatePlaylistUser({ playlistId: this.itemId, userId: user.Id, updatePlaylistUserDto: { CanEdit: true } });
            } else if (permissions != null && permissions.CanEdit === false) {
                await this.playlistApi.updatePlaylistUser({ playlistId: this.itemId, userId: user.Id, updatePlaylistUserDto: { CanEdit: false } });
            } else {
                await this.playlistApi.removeUserFromPlaylist({ playlistId: this.itemId, userId: user.Id });
            }
        };

        // Retrieve all users and their permissions
        const users = await this.getAllUsers();
        if (users != null) {
            for (const user of users ) {
                html += getUserPermssionHtml(user);
            }
        } else {
            html += '<div class="fieldDescription">';
            html += globalize.translate('NoUsersFound');
            html += '</div>';
        }
        html += getEditorFooterHtml();

        dlg.innerHTML = html;

        if (users != null) {
            for (const user of users) {
                const editPermissions = user.permissions?.CanEdit;

                const userHTML = dlg.querySelector('.USER' + user.Id);
                userHTML.querySelector('.chkViewPermissions').checked = !!user.permissions;
                userHTML.querySelector('.chkEditPermissions').checked = !!editPermissions;
            }

            // Adds listeners to the checkboxes to update the permissions object and UI
            for (const user of users) {
                const userHTML = dlg.querySelector('.USER' + user.Id);
                userHTML.querySelector('.chkEditPermissions').addEventListener('change', function () {
                    const hasEditPermissions = this.checked;
                    updateUserPermissions(user, true, hasEditPermissions);
                });
                userHTML.querySelector('.chkViewPermissions').addEventListener('change', function () {
                    const hasViewPermissions = this.checked;
                    if (!hasViewPermissions) {
                        userHTML.querySelector('.chkEditPermissions').checked = false;
                        userHTML.querySelector('.fldEditPermissions').classList.add('hide');
                    } else {
                        userHTML.querySelector('.fldEditPermissions').classList.remove('hide');
                    }
                    updateUserPermissions(user, hasViewPermissions, false);
                });
            }

            dlg.querySelector('#selectViewPermissions').addEventListener('change', function () {
                const isPublic = this.value === 'public';
                for (const user of users) {
                    const canView = !!user.permissions;
                    const userHTML = dlg.querySelector('.USER' + user.Id);
                    if (!isPublic && !canView) {
                        userHTML.querySelector('.fldEditPermissions').classList.add('hide');
                    } else {
                        userHTML.querySelector('.fldEditPermissions').classList.remove('hide');
                    }
                    if (isPublic) {
                        userHTML.querySelector('.fldViewPermissions').classList.add('hide');
                    } else {
                        userHTML.querySelector('.fldViewPermissions').classList.remove('hide');
                    }
                }
            });
        }

        dlg.querySelector('#selectViewPermissions').value = 'private';

        dlg.querySelector('form').addEventListener('submit', async (e) => {
            const isPublic = dlg.querySelector('#selectViewPermissions').value === 'public';
            await this.playlistApi.updatePlaylist({ playlistId: this.itemId, updatePlaylistDto: { IsPublic:  isPublic } });
            for (const user of users) {
                submitUserPermissions(user);
            }
            onSubmit.bind(this)(e);
        });

        if (this.options.mode) {
            dlg.querySelector('#selectViewPermissions').value = this.options.mode;
        }

        dlg.querySelector('#selectViewPermissions').dispatchEvent(new CustomEvent('change'));

        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });

        if (layoutManager.tv) {
            centerFocus(dlg.querySelector('.formDialogContent'), false, true);
        }

        return new Promise(function (resolve) {
            if (layoutManager.tv) {
                centerFocus(dlg.querySelector('.formDialogContent'), false, false);
            }

            dlg.addEventListener('close', resolve);
            dialogHelper.open(dlg);
        });
    }
}

export default PermissionsDialog;
